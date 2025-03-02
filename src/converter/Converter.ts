import { html } from '@codemirror/lang-html';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { linter } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';
import doc from '~/assets/docs/doc.json';
import { RenderMode, ViewMode } from '~/constants';
import { createEditorView, delay, highlight, initResizableSplitter, jsonToMarkdown, markdownToHtml, safeParseJson, scrollToAnchor, scrollToTocAnchor, syncViewScroll, useLeaveConfirmation } from '~/utils';

const leaveConfirmation = useLeaveConfirmation();

class Converter {
  private jsonView: HTMLDivElement;

  private previewView: HTMLDivElement;

  private htmlView: HTMLDivElement;

  private markdownView: HTMLDivElement;

  private viewModeRadioGroup: HTMLDivElement;

  private renderModeSelect: HTMLSelectElement;

  private splitter: HTMLDivElement;

  private jsonEditorView: EditorView;

  private htmlEditorView: EditorView;

  private markdownEditorView: EditorView;

  private toc!: HTMLDivElement;

  constructor() {
    this.jsonView = document.querySelector('#json-view')!;
    this.previewView = document.querySelector('#preview-view')!;
    this.htmlView = document.querySelector('#html-view')!;
    this.markdownView = document.querySelector('#markdown-view')!;
    this.viewModeRadioGroup = document.querySelector('#view-mode')!;
    this.renderModeSelect = document.querySelector('#render-mode')!;
    this.splitter = document.querySelector('.splitter')!;
    this.jsonEditorView = this.createJsonEditorView();
    this.htmlEditorView = this.createHtmlEditorView();
    this.markdownEditorView = this.createMarkdownEditorView();

    requestAnimationFrame(() => {
      this.init();
    });
  }

  private createJsonEditorView(): EditorView {
    let isFirstUpdate = true;
    return createEditorView(
      this.jsonView,
      JSON.stringify(doc, null, 2),
      [
        json(),
        linter(jsonParseLinter()),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged && !isFirstUpdate) {
            return;
          }
          if (isFirstUpdate) {
            isFirstUpdate = false;
          }

          const data = safeParseJson(this.jsonEditorView.state.doc.toString());
          if (!data) return;

          const markdown = jsonToMarkdown(data);
          const html = markdownToHtml(markdown, ['target']);

          this.previewView.innerHTML = `<div class="markdown container">${html}</div>`;

          this.htmlEditorView.dispatch({
            changes: {
              from: 0,
              to: this.htmlEditorView.state.doc.length,
              insert: html,
            },
          });

          this.markdownEditorView.dispatch({
            changes: {
              from: 0,
              to: this.markdownEditorView.state.doc.length,
              insert: markdown,
            },
          });

          this.updateToc();
          this.highlightTableCodeBlocks();
        }),
        EditorView.focusChangeEffect.of((state, focusing) => {
          if (!focusing) {
            (async () => {
              const data = safeParseJson(state.doc.toString());
              if (!data) return;
              await delay(0);
              this.jsonEditorView.dispatch({
                changes: {
                  from: 0,
                  to: state.doc.length,
                  insert: JSON.stringify(data, null, 2),
                },
              });
            })();
          }
          return null;
        }),
      ],
    );
  }

  private createHtmlEditorView(): EditorView {
    return createEditorView(
      this.htmlView,
      '',
      [
        html(),
        EditorView.lineWrapping,
      ],
    );
  }

  private createMarkdownEditorView(): EditorView {
    return createEditorView(
      this.markdownView,
      '',
      [
        markdown(),
        EditorView.lineWrapping,
      ],
    );
  }

  private init() {
    this.initLeaveConfirmation();
    this.initSplitter();
    this.initScroller();
    this.initViewModeRadioGroup();
    this.initRenderModeSelect();
    this.initAnchors();
  }

  private initLeaveConfirmation() {
    leaveConfirmation.enable();
  }

  private initSplitter() {
    initResizableSplitter(this.splitter, this.jsonView);
  }

  private initScroller() {
    const views = [
      this.jsonView,
      this.previewView,
      this.htmlView,
      this.markdownView,
    ];

    views.forEach((view) => {
      view.addEventListener('scroll', () => syncViewScroll(views, view));
    });
  }

  private initViewModeRadioGroup() {
    const defaultViewMode = ViewMode.SPLIT;

    const restoreState = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const mode = Object.values(ViewMode).find(mode => urlParams.has(mode)) ?? defaultViewMode;
      const input = this.viewModeRadioGroup.querySelector(`input[value="${mode}"]`) as HTMLInputElement;
      input.checked = true;
      updateViewMode(mode);
    };

    const updateViewMode = (mode: string) => {
      const leftPane = document.querySelector('.pane-left') as HTMLDivElement;
      const rightPane = document.querySelector('.pane-right') as HTMLDivElement;
      const splitter = this.splitter;
      switch (mode) {
        case ViewMode.EDIT:
          leftPane.toggleAttribute('hidden', false);
          leftPane.style.width = '100%';
          leftPane.style.maxWidth = '100%';
          splitter.hidden = true;
          rightPane.toggleAttribute('hidden', true);
          this.toc.style.visibility = 'hidden';
          leaveConfirmation.enable();
          break;
        case ViewMode.SPLIT:
          leftPane.toggleAttribute('hidden', false);
          leftPane.style.width = '50%';
          leftPane.style.maxWidth = '80%';
          splitter.hidden = false;
          rightPane.toggleAttribute('hidden', false);
          this.toc.style.visibility = 'hidden';
          leaveConfirmation.enable();
          break;
        case ViewMode.VIEW:
          leftPane.toggleAttribute('hidden', true);
          splitter.hidden = true;
          rightPane.toggleAttribute('hidden', false);
          this.toc.style.visibility = 'visible';
          leaveConfirmation.disable();
          break;
      }
    };

    restoreState();

    this.viewModeRadioGroup.addEventListener('change', (event) => {
      const input = event.target as HTMLInputElement;
      const { value } = input;
      window.history.replaceState(null, '', value === defaultViewMode ? window.location.pathname : `?${value}`);
      updateViewMode(value);
    });
  }

  private initRenderModeSelect() {
    this.renderModeSelect.addEventListener('change', (event) => {
      const { value } = event.target as HTMLSelectElement;
      this.htmlView.classList.toggle('pane-right', value === RenderMode.HTML);
      this.markdownView.classList.toggle('pane-right', value === RenderMode.MARKDOWN);
      this.previewView.classList.toggle('pane-right', value === RenderMode.PREVIEW);
      const viewMode = (this.viewModeRadioGroup.querySelector('input:checked') as HTMLInputElement).value;
      if (viewMode === ViewMode.EDIT) return;
      this.htmlView.toggleAttribute('hidden', value !== RenderMode.HTML);
      this.markdownView.toggleAttribute('hidden', value !== RenderMode.MARKDOWN);
      this.previewView.toggleAttribute('hidden', value !== RenderMode.PREVIEW);
    });
  }

  private initAnchors() {
    const restoreState = () => {
      scrollToAnchor(window.location.hash, this.previewView);
      scrollToTocAnchor(window.location.hash, this.toc);
    };

    restoreState();

    this.previewView.addEventListener('click', (event) => {
      const anchor = (event.target as HTMLElement).closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || !href.startsWith('#')) return;
      event.preventDefault();
      history.replaceState(null, '', href);
      scrollToAnchor(href, this.previewView);
      scrollToTocAnchor(href, this.toc);
    });
  }

  private updateToc() {
    this.toc = document.querySelector('.table-of-contents')!;
    const viewMode = (this.viewModeRadioGroup.querySelector('input:checked') as HTMLInputElement).value;
    this.toc.style.visibility = viewMode === ViewMode.VIEW ? 'visible' : 'hidden';
  }

  private highlightTableCodeBlocks() {
    const codeBlocks = document.querySelectorAll('table td pre code');
    codeBlocks.forEach(block => highlight.highlightElement(block as HTMLElement));
  }
}

export default Converter;
