// Appended to the shared Docker and Cloudflare editor pages.
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
document.getElementById('logout').addEventListener('click', async () => {
  if (hasUnsavedChanges && !confirm(t('unsaved_changes'))) return;
  try {
    const response = await fetch('logout/', { method: 'POST', headers: { 'X-SYVS-Request': '1' } });
    if (!response.ok && response.status !== 401) await readEditorResponse(response);
    hasUnsavedChanges = false;
    location.replace('login/');
  } catch (error) { showToast('warning', syvsEscapeHtml(error.message)); }
});
loadPage();
