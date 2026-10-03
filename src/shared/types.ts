export interface Viewport {
  width: number;
  height: number;
}
export interface ElementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface ElementEvidence {
  selector: string;
  tag: string;
  text: string;
  rect: ElementRect;
  styles: Record<string, string>;
  source?: { file: string; line: number; column: number };
}
export interface LayoutIssue {
  id: string;
  kind: 'horizontal-overflow' | 'viewport-overflow';
  element: ElementEvidence;
  detail: string;
  viewport: Viewport;
}
export interface Annotation {
  id: string;
  note: string;
  element: ElementEvidence;
  viewport: Viewport;
}
export interface Protection {
  id: string;
  label: string;
  element: ElementEvidence;
  viewport: Viewport;
}
export interface ProtectionCheck {
  id: string;
  status: 'unchanged' | 'changed' | 'missing' | 'ambiguous';
  changes: string[];
  before: ElementEvidence;
  after?: ElementEvidence;
}
export interface ScanResult {
  issues: LayoutIssue[];
  viewport: Viewport;
  documentWidth: number;
  truncated: boolean;
}
export interface PickResult {
  element: ElementEvidence;
  viewport: Viewport;
  mode: 'change' | 'protect';
}
export interface RecheckResult {
  checks: ProtectionCheck[];
  viewport: Viewport;
}
export type BridgeMethod = 'scan' | 'pick' | 'highlight' | 'recheck' | 'cancelPick';
export interface BridgeRequest {
  type: 'layout-care/request';
  token: string;
  id: string;
  method: BridgeMethod;
  payload: unknown;
}
export interface BridgeConnect {
  type: 'layout-care/connect';
  token: string;
}
export interface BridgeReady {
  type: 'layout-care/ready';
  token: string;
  version: 1;
  pageUrl: string;
}
export type BridgeResponse =
  | {
      type: 'layout-care/result';
      token: string;
      id: string;
      pageUrl: string;
      ok: true;
      result:
        ScanResult | PickResult | RecheckResult | { highlighted: boolean } | { cancelled: boolean };
    }
  | {
      type: 'layout-care/result';
      token: string;
      id: string;
      pageUrl: string;
      ok: false;
      error: string;
    };
