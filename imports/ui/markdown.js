import MarkdownIt from 'markdown-it';
import fm from 'front-matter';
import fs from 'fs';
import Immutable from 'immutable';


import {codeToText} from './util';

const markdownIt = new MarkdownIt();

/*
 * Extracts a code block (Immutable Map) from the
 * block-parsed Markdown.
 */
function extractCodeBlock(token) {
  const info = token.info.split(';').map(s => s.trim());
  const language = info[0] || undefined;
  const option = info[1] || undefined;
  const type = info[2] || undefined;
  if (['runnable', 'auto', 'hidden'].indexOf(option) < 0) {
    alert("HI");
    // If not an executable block, we just want to represent as Markdown.
    return null;
  }
  return Immutable.fromJS({
    type: type,
    content: token.content.trim(),
    language,
    option,

  });
}

function flushTextBlock(counter, blocks, blockOrder, text) {
  if (!text.match(/\S+/)) {
    return;
  }
  const id = String(counter);
  blockOrder.push(id);
  blocks[id] = Immutable.fromJS({
    type: 'text',
    id: id,
    content: text.trim()
  });
}

function extractBlocks(md) {
  //const rgx = /(```\w+;\s*?(?:runnable|auto|hidden)\s*?[\n\r]+[\s\S]*?^\s*?```\s*?$)/gm;
  const rgx = /(```\w+;\s*?(?:runnable|auto|hidden);\s*?(?:code|p5)\s*?[\n\r]+[\s\S]*?^\s*?```\s*?$)/gm;
  const parts = md.split(rgx);

  let blockCounter = 0;
  let currentString = "";
  const blockOrder = [];
  const blocks = {};

  for (let i = 0; i < parts.length; i++) {


    const part = parts[i];

    const tokens = markdownIt.parse(parts[i], {});

    if (tokens.length === 1 && tokens[0].type === 'fence') {

      const block = extractCodeBlock(tokens[0]);
      // If it's an executable block
      if (block) {
        // Flush the current text to a text block
        flushTextBlock(blockCounter, blocks, blockOrder, currentString);
        currentString = "";
        blockCounter++;

        // Then add the code block
        const id = String(blockCounter);
        blockOrder.push(id);
        blocks[id] = block.set('id', id);
        blockCounter++;
        continue;
      }
    }
    // If it isn't an executable code block, just add
    // to the current text block;
    currentString += part;
  }
  flushTextBlock(blockCounter, blocks, blockOrder, currentString);

  return {
    content: blockOrder,
    blocks
  };
}

function getDate(attributes) {
  if (attributes.created) {
    return new Date(Date.parse(attributes.created));
  }
  return undefined;
}

export function parse(md) {
  const doc = fm(md);
  const {content, blocks} = extractBlocks(doc.body);
  return Immutable.fromJS({
    metadata: {
      title: doc.attributes.title,
      created: getDate(doc.attributes),
      author: doc.attributes.author,
      featured_image: doc.attributes.featured_image,
      datasources: doc.attributes.datasources || {},
      original: doc.attributes.original,
      showFooter: doc.attributes.show_footer !== false
    },
    undoStack: Immutable.List(),
    content,
    blocks
  });
}

export function updateTitle(state, title, name) {
  const metadata = state.get('metadata');
  return Immutable.fromJS({
    metadata: {
      title: title,
      created: Date(),
      author: name,
      datasources: metadata.get('datasources'),
      original: metadata.get('original'),
      featured_image: metadata.get('featured_image'),
      showFooter: metadata.get('showFooter')
    },
    undoStack: Immutable.List(),
    content: state.get("content"),
    blocks: state.get("blocks")
  });

}

/*
 * Functions for rendering blocks back into Markdown
 */

function renderDatasources(datasources) {
  let rendered = "datasources:\n";
  datasources.map((url, name) => {
    rendered += '    ' + name + ': "' + url + '"\n';
  });
  return rendered;
}

function renderMetadata(metadata) {
  let rendered = '---\n';
  if (metadata.get('title') !== undefined) {
    rendered += 'title: "' + metadata.get('title') + '"\n';
  }
  if (metadata.get('author') !== undefined) {
    rendered += 'author: "' + metadata.get('author') + '"\n';
  }
  if (metadata.get('created') !== undefined) {
    rendered += 'created: "' + metadata.get('created').toString() + '"\n';
  }
  const datasources = metadata.get('datasources');
  if (datasources && datasources.size > 0) {
    rendered += renderDatasources(datasources);
  }
  const original = metadata.get('original');
  if (original && original.get('title') && original.get('url')) {
    rendered += 'original:\n';
    rendered += '    title: "' + original.get('title') + '"\n';
    rendered += '    url: "' + original.get('url') + '"\n';
  }
  if (metadata.get('featured_image') !== undefined) {
    rendered += 'featured_image: ' + metadata.get('featured_image') + '\n';
  }
  if (metadata.get('showFooter') !== undefined) {
    rendered += 'show_footer: ' + metadata.get('showFooter') + '\n';
  }
  return rendered + '---\n\n';
}

function renderBlock(block) {
  if (block.get('type') === 'text') {
    return block.get('content');
  }
  return codeToText(block, true);
}

function renderBody(blocks, blockOrder) {
  return blockOrder
      .map((id) => blocks.get(id))
      .map(renderBlock)
      .join('\n\n') + '\n';
}

export function render(notebook) {
  let rendered = "";
  rendered += renderMetadata(notebook.get('metadata'));
  rendered += renderBody(notebook.get('blocks'), notebook.get('content'));
  return rendered;
}

export function renderString(notebook) {
  let rendered = "";
  rendered += renderMetadata(notebook.get('metadata'));
  rendered += renderBody(notebook.get('blocks'), notebook.get('content'));
  return rendered;
}
