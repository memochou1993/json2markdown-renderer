import { Converter } from '@memochou1993/markdown2html';
import { Tokens } from 'marked';
import { markedHighlight } from 'marked-highlight';
import externalLinkImage from '~/assets/external-link.svg?raw';
import linkImage from '~/assets/link.svg?raw';
import highlight from './highlight';
import toKebabCase from './to-kebab-case';

interface HeadingWithId extends Tokens.Heading {
  id: string;
}

const markdownToHTML = (markdown: string, allowedAttributes: string[] = []) => {
  const idCounts: Record<string, number> = {};
  const headings: HeadingWithId[] = [];

  return new Converter(markdown)
    .setDOMPurifyConfig({
      ADD_ATTR: allowedAttributes,
    })
    .setMarkedExtensions([
      {
        hooks: {
          postprocess(html) {
            const buildTOC = (headings: HeadingWithId[], maxDepth = 6) => {
              const rootList = document.createElement('ul');
              const nestedLists: Record<number, HTMLUListElement> = { 1: rootList };
              let currentDepth = 1;
              headings.forEach(({ depth, text, id }) => {
                if (depth > maxDepth) return;
                const listItem = document.createElement('li');
                const anchor = document.createElement('a');
                anchor.href = `#${id}`;
                anchor.textContent = text;
                listItem.appendChild(anchor);
                if (depth > currentDepth) {
                  const list = document.createElement('ul');
                  nestedLists[currentDepth].lastElementChild?.appendChild(list);
                  nestedLists[depth] = list;
                }
                currentDepth = depth;
                nestedLists[depth].appendChild(listItem);
              });
              return rootList.outerHTML;
            };
            return `<div class="table-of-contents">${buildTOC(headings)}</div>${html}`;
          },
        },
      },
      {
        renderer: {
          heading(heading) {
            const { depth, text } = heading;
            const id = toKebabCase(text);
            const count = idCounts[id] || 0;
            const uniqueId = `${id}${count > 0 ? `-${count}` : ''}`;
            idCounts[id] = count + 1;
            headings.push({ ...heading, id: uniqueId });
            return `<h${depth}><a id="${uniqueId}" href="#${uniqueId}" class="anchor">${linkImage}${text}</a></h${depth}>`;
          },
          link(link) {
            const { href, title, text } = link;
            return `<a href="${href}" title="${title || ''}" target="_blank" rel="noopener noreferrer">${text || href}${href.startsWith('http') && externalLinkImage}</a>`;
          },
        },
      },
      markedHighlight({
        langPrefix: 'lang-',
        highlight(code, lang) {
          const options = {
            language: highlight.getLanguage(lang) ? lang : 'javascript',
          };
          return highlight.highlight(code, options).value;
        },
      }),
    ])
    .toHTML();
};

export default markdownToHTML;
