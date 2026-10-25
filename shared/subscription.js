// Linear scan: a lazy /<!--.*?-->/g regex can repeatedly rescan unmatched openers.
export function removeComments(content) {
  const parts = [];
  let cursor = 0;
  while (true) {
    const start = content.indexOf('<!--', cursor);
    if (start === -1) break;
    const end = content.indexOf('-->', start + 4);
    if (end === -1) break;
    parts.push(content.slice(cursor, start));
    cursor = end + 3;
  }
  parts.push(content.slice(cursor));
  return parts.join('');
}
