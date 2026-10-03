/** Preview declarations for the additive Browser patch, absent in stock rc.2. */
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit';
import type { BrowserAnnotationOptions } from './page-inspector';
import type { AnnotationResult } from './protocol';
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'conversation.message.user-text': {
      kind: 'chain';
      scope: 'session';
      owner: { readonly text: string };
    };
    'sidebar.right.tab.browser.toolbar': {
      kind: 'list';
      scope: 'session';
      owner: BrowserAnnotationOwner;
    };
    'sidebar.right.tab.browser.annotations': {
      kind: 'list';
      scope: 'session';
      owner: BrowserAnnotationOwner;
    };
  }
}
interface BrowserAnnotationOwner {
  readonly tabId: TabId;
  readonly url: string | undefined;
  readonly loading: boolean;
  readonly annotate: (options: BrowserAnnotationOptions) => Promise<AnnotationResult>;
  readonly cancelAnnotation: () => void;
}
