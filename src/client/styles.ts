/** Layout rules only; buttons and text fields inherit the public Harness primitives. */
export const styles = `
.lc-root{box-sizing:border-box;height:100%;overflow:auto;padding:16px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-family:inherit;font-size:14px;line-height:22px}
.lc-root *{box-sizing:border-box}
.lc-root h2{font-size:18px;line-height:26px;font-weight:500;margin:0}
.lc-root h3{font-size:14px;line-height:22px;font-weight:500;margin:0}
.lc-root p{margin:6px 0 10px}
.lc-root small{display:block;font-size:12px;line-height:18px}
.lc-root code{font:12px/18px ui-monospace,monospace;overflow-wrap:anywhere}
.lc-root label{display:block;font-size:12px;line-height:18px}
.lc-root label .lc-field{display:flex;margin-top:4px}
.lc-intro{margin-bottom:16px}
.lc-intro p,.lc-muted{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.lc-root textarea{width:100%;min-width:0;min-height:76px;border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);padding:8px 10px;border-radius:8px;font:inherit;font-size:13px;line-height:20px;resize:vertical}
.lc-root input[type=checkbox]{accent-color:var(--dsw-alias-state-business-primary);flex:none}
.lc-root :is(textarea,summary):focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.lc-row{display:flex!important;align-items:center;gap:8px}
.lc-row .lc-field{flex:1;min-width:0}
.lc-root button[aria-pressed=true]{box-shadow:inset 0 0 0 1px var(--dsw-alias-state-business-primary)}
.lc-wrap{flex-wrap:wrap}
.lc-address{margin-bottom:12px}
.lc-tools{display:grid;gap:8px;margin-bottom:10px}
.lc-tools .lc-row:first-child{justify-content:space-between}
.lc-status{font-size:12px}
.lc-success{color:var(--dsw-alias-state-success-primary);font-size:12px}
.lc-error{color:var(--dsw-alias-state-error-primary);font-size:12px;overflow-wrap:anywhere}
.lc-stage{width:100%;overflow:hidden;border:1px solid var(--dsw-alias-border-l3);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
.lc-stage iframe{position:absolute;left:0;top:0;border:0;background:white}
.lc-actions{display:flex;gap:6px;margin:12px 0}
.lc-section{border-top:1px solid var(--dsw-alias-border-l3);padding:14px 0}
.lc-section-title{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.lc-section h3 span{color:var(--dsw-alias-label-secondary);font-weight:400;margin-left:4px}
.lc-item{padding:10px 0;border-bottom:1px solid var(--dsw-alias-border-l4)}
.lc-item:last-child{border-bottom:0}
.lc-item p,.lc-item ul{font-size:12px;line-height:18px;margin:6px 0}
.lc-item .lc-section-title{margin-bottom:8px}
.lc-item .lc-section-title code{flex:1}
.lc-empty{padding:18px 0}
.lc-empty code{display:block;margin:8px 0;padding:8px;background:var(--dsw-alias-bg-layer-1);border-radius:8px}
.lc-root summary{cursor:pointer;font-size:12px}
.lc-prompt{min-height:260px!important;margin-top:12px;font:12px/18px ui-monospace,monospace!important}
.lc-submit{padding-bottom:20px}
`;
