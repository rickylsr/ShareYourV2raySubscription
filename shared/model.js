export function normaliseStore(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TypeError('Invalid settings object');
  const groups = Array.isArray(data.groups) ? data.groups : [
    { name: '普通线路', links: [] }, { name: 'Premium线路', links: [] },
  ];
  return {
    accesskey: '', key_md5: '', ...data,
    groups: groups.map(group => {
      if (!group || typeof group !== 'object' || Array.isArray(group)) throw new TypeError('Invalid group');
      return { name: '', links: [], ...group };
    }),
  };
}
