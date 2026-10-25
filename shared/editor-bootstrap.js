// Appended only to Cloudflare HTML; Docker's template is unchanged.
function syvsEscapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}
window.addEventListener('syvs:loaded', function () {
  for (const id of ['saveLinksBtn', 'savePwd', 'add-group-tab']) document.getElementById(id).disabled = false;
  document.getElementById('loading').hidden = true;
  const noKey = document.getElementById('accesskey').disabled;
  document.getElementById('savekeytf').checked = noKey;
  document.getElementById('savekeytfAlert').classList.toggle('show', noKey);
  hasUnsavedChanges = false;
});
document.getElementById('myTabContent').addEventListener('input', function (event) {
  hasUnsavedChanges = true;
  const input = event.target;
  if (!input.classList.contains('groupNameInput')) return;
  const name = input.value.trim();
  const duplicate = [...document.querySelectorAll('.groupNameInput')].some(other => other !== input && other.value.trim() === name);
  input.classList.toggle('is-invalid', !name || duplicate);
  input.classList.toggle('is-valid', Boolean(name) && !duplicate);
  const tab = document.getElementById(input.id.replace('-group-name', '-tab'));
  if (tab && name && !duplicate) tab.textContent = name;
});
document.getElementById('myTabContent').addEventListener('click', function (event) {
  if (event.target.closest('button')) hasUnsavedChanges = true;
});
loadPage();
