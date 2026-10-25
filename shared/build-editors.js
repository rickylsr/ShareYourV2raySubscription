import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
export async function buildEditors(nunjucks) {

let source = (await readFile(new URL('../app/templates/editor.html', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
function replaceOnce(before, after) {
  if (source.split(before).length !== 2) throw new Error(`Shared template hook changed: ${before.slice(0, 80)}`);
  source = source.replace(before, after);
}
source = source.replaceAll('language_options.items()', 'language_options');
// Reuse the existing API loader; node markup is rendered in the browser.
replaceOnce('function loadPage() {\n               fetch(', 'function loadPage() {\n               return fetch(');
replaceOnce('.then(response => {', '.then(async response => {');
replaceOnce("                    if (!response.ok) {\n                        throw new Error(t('network_error'));\n                    }\n                    return response.json();",
  "                    if (!response.ok) {\n                        const failure = await response.json().catch(() => ({}));\n                        throw new Error(failure.message || t('network_error'));\n                    }\n                    return response.json();");
replaceOnce("loading.textContent = t('load_failed');", "loading.textContent = error.message || t('load_failed');");
replaceOnce('                    }).catch(error => {', "                        window.dispatchEvent(new Event('syvs:loaded'));\n                    }).catch(error => {");
replaceOnce('function createGroupComponent(name, index, show_the_component=false, share_link=\'\') {',
  "function createGroupComponent(name, index, show_the_component=false, share_link='') {\n                name = syvsEscapeHtml(name); share_link = syvsEscapeHtml(share_link);");
replaceOnce("function createLinkComponent(url, type=t('pending_parse'), comment=t('pending_parse')) {",
  "function createLinkComponent(url, type=t('pending_parse'), comment=t('pending_parse')) {\n                url = syvsEscapeHtml(url); type = syvsEscapeHtml(type); comment = syvsEscapeHtml(comment);");
replaceOnce('${group.name}', '${syvsEscapeHtml(group.name)}');
replaceOnce("document.addEventListener('DOMContentLoaded', function() {",
  "window.addEventListener('syvs:loaded', function() {\n            if (window.syvsTourStarted) return; window.syvsTourStarted = true;");
replaceOnce("showToast('warning', t('save_groups_network_failed'));",
  "const failure = await response.json(); showToast('warning', syvsEscapeHtml(failure.message || t('save_groups_network_failed')));");
replaceOnce("showToast('warning', t('save_key_network_failed'));",
  "const failure = await response.json(); showToast('warning', syvsEscapeHtml(failure.message || t('save_key_network_failed'))); return;");
for (const id of ['saveLinksBtn', 'savePwd', 'add-group-tab']) source = source.replace(`id="${id}"`, `id="${id}" disabled`);
replaceOnce('<ul class="nav nav-underline mb-3"', '<div id="loading" role="status" class="alert alert-info">{{ cloud_loading }}</div>{% if cloud_limits %}<p class="text-secondary small">{{ cloud_limits }}</p>{% endif %}<ul class="nav nav-underline mb-3"');
const bootstrap = await readFile(new URL('./editor-bootstrap.js', import.meta.url), 'utf8');
source = source.replace('</body>', `<script>\n${bootstrap}\n</script></body>`);

const translations = {};
for (const filename of (await readdir(new URL('../app/translations/', import.meta.url))).sort()) {
  if (filename.endsWith('.json')) translations[filename.slice(0, -5)] = JSON.parse(await readFile(new URL(`../app/translations/${filename}`, import.meta.url), 'utf8'));
}
const environment = new nunjucks.Environment([], { autoescape: true });
environment.addFilter('urlencode', value => encodeURIComponent(value));
environment.addFilter('tojson', value => new nunjucks.runtime.SafeString(JSON.stringify(value).replace(/[<>&']/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)));
const template = nunjucks.compile(source, environment);
for (const target of ['cloudflare', 'docker']) {
const output = {};
for (const mode of target === 'docker' ? ['docker'] : ['free', 'paid']) {
const pages = {};
for (const language of ['zh', 'en']) {
  for (const fresh of [true, false]) {
    pages[`${language}:${fresh ? 'new' : 'existing'}`] = template.render({
      baseurl: '', shareurl: '', accesskey: '', groups: [], is_newuser: fresh,
      language, language_options: { zh: { label: '中文', html_lang: 'zh-CN' }, en: { label: 'English', html_lang: 'en' } },
      translations: translations[language],
      _: key => translations[language][key] ?? translations.zh[key] ?? key,
      cloud_loading: language === 'zh' ? '正在加载订阅…' : 'Loading subscriptions…',
      cloud_limits: target === 'docker' ? '' : mode === 'free'
        ? (language === 'zh' ? 'Free 容量策略：最多 32 组、256 个节点，单次保存 16 KiB。' : 'Free capacity policy: 32 groups, 256 nodes, 16 KiB per save.')
        : (language === 'zh' ? 'Paid 容量策略：最多 256 组、4096 个节点，单次保存 256 KiB。需在 Cloudflare 另行开通 Workers Paid。' : 'Paid capacity policy: 256 groups, 4096 nodes, 256 KiB per save. Enable Workers Paid separately in Cloudflare.'),
    });
  }
}
output[mode] = pages;
}
const destination = new URL(`../${target}/generated/`, import.meta.url);
await mkdir(destination, { recursive: true });
await writeFile(new URL('pages.js', destination), `export default ${JSON.stringify(target === 'docker' ? output.docker : output)};\n`);

}
}
