// Track the complete async public write, including reads before its final commit.
export function createPluginMutationGate({ blocked = () => false } = {}) {
  const pending = new Map(), deleting = new Set()
  function run(id, work) {
    if (blocked(id) || deleting.has(id)) return Promise.reject(new Error('本局正在物理清理，插件写入已停止'))
    const tasks = pending.get(id) || new Set()
    pending.set(id, tasks)
    const task = Promise.resolve().then(work)
    tasks.add(task)
    const release = () => { tasks.delete(task); if (!tasks.size) pending.delete(id) }
    task.then(release, release)
    return task
  }
  async function whenIdle(id) {
    while (pending.get(id)?.size) await Promise.allSettled([...pending.get(id)])
  }
  return Object.freeze({ run, whenIdle,
    async deleting(id, work) {
      if (deleting.has(id) || blocked(id)) throw new Error('本局清理正在进行')
      deleting.add(id)
      try { await whenIdle(id); return await work() }
      finally { deleting.delete(id) }
    }
  })
}
