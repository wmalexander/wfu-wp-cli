export const ALB_FIXED_RESPONSE_LIMIT = 1024;
export const UAT_ASLEEP_TITLE = 'UAT is asleep';
export const UAT_WAKING_TITLE = 'UAT is waking up';
export const UAT_PAGES_BASE_URL = 'https://uat.wp.cdn.aws.wfu.edu/uat-status';
export const UAT_ASLEEP_URL = `${UAT_PAGES_BASE_URL}/asleep.html`;
export const UAT_WAKING_URL = `${UAT_PAGES_BASE_URL}/waking.html`;
export const UAT_PAGES_BUCKET_PREFIX =
  's3://wfu-cer-wordpress-uat-us-east-1/uat-status';

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

function page(title: string, src: string): string {
  return (
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>${title}</title></head><body style="margin:0">` +
    `<iframe src="${src}" title="${title}" style="position:fixed;inset:0;` +
    `width:100%;height:100%;border:0">${title}</iframe>` +
    `${pollScript(title)}</body></html>`
  );
}

export function uatAsleepBody(): string {
  return page(UAT_ASLEEP_TITLE, UAT_ASLEEP_URL);
}

export function uatWakingBody(): string {
  return page(UAT_WAKING_TITLE, UAT_WAKING_URL);
}

export function detectUatPage(body: string): string | null {
  if (body.includes(`<title>${UAT_ASLEEP_TITLE}</title>`)) return 'uat-asleep';
  if (body.includes(`<title>${UAT_WAKING_TITLE}</title>`)) return 'uat-waking';
  return null;
}
