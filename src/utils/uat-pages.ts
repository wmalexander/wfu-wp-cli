export const ALB_FIXED_RESPONSE_LIMIT = 1024;
export const UAT_ASLEEP_TITLE = 'UAT is asleep';
export const UAT_WAKING_TITLE = 'UAT is waking up';
export const DEACON_GIF_URL =
  'https://uat.wp.cdn.aws.wfu.edu/wfu-gutenberg-quarantheme/assets/images/walking_deacon.gif';

const STYLE =
  '<style>body{font-family:system-ui,sans-serif;text-align:center;' +
  'padding:12vh 16px;color:#222;background:#fff}h1{font-size:1.6rem}' +
  'p{max-width:32rem;margin:1rem auto;line-height:1.5}</style>';

function pollScript(title: string): string {
  return (
    '<script>setInterval(function(){fetch(location.href,' +
    '{cache:"no-store",redirect:"manual"}).then(function(r){' +
    'if(r.type=="opaqueredirect")return location.reload();' +
    'return r.text().then(function(t){' +
    `if(t.indexOf("<title>${title}</title>")<0)location.reload()})` +
    '}).catch(function(){})},15000)</script>'
  );
}

function page(title: string, inner: string): string {
  return (
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>${title}</title>${STYLE}</head><body>${inner}` +
    `${pollScript(title)}</body></html>`
  );
}

export function uatAsleepBody(): string {
  return page(
    UAT_ASLEEP_TITLE,
    `<h1>${UAT_ASLEEP_TITLE}</h1>` +
      '<p>The UAT test environment sleeps when nobody is using it.</p>' +
      '<p>The WordPress team can wake it in a few minutes. ' +
      'This page updates on its own once it starts waking.</p>'
  );
}

export function uatWakingBody(): string {
  return page(
    UAT_WAKING_TITLE,
    `<img src="${DEACON_GIF_URL}" alt="" width="160">` +
      `<h1>${UAT_WAKING_TITLE}</h1>` +
      '<p>This usually takes a few minutes. Keep this tab open and it will ' +
      'take you where you were going as soon as UAT is ready.</p>'
  );
}

export function detectUatPage(body: string): string | null {
  if (body.includes(`<title>${UAT_ASLEEP_TITLE}</title>`)) return 'uat-asleep';
  if (body.includes(`<title>${UAT_WAKING_TITLE}</title>`)) return 'uat-waking';
  return null;
}
