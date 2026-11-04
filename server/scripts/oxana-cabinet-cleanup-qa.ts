import { getOxanaPool, closeOxanaPool } from '../src/oxana/db.js'

const pool = getOxanaPool()

try {
  const tasks = await pool.query<{ id: string }>(
    `delete from oxana.tasks
     where title like 'QA-ОКСИ-%'
     returning id`,
  )
  const events = await pool.query<{ id: string }>(
    `delete from oxana.events
     where title like 'QA-ОКСИ-%'
     returning id`,
  )
  const projects = await pool.query<{ id: string }>(
    `delete from oxana.projects
     where title like 'QA-ОКСИ-%'
     returning id`,
  )
  const ids = [
    ...tasks.rows.map((row) => row.id),
    ...events.rows.map((row) => row.id),
  ]
  let jobs = 0
  let notes = 0
  if (ids.length) {
    const jobResult = await pool.query(
      `delete from oxana.jobs
       where kind = 'reminder'
         and (${ids.map((_, index) => `idempotency_key like '%' || $${index + 1} || '%'`).join(' or ')})`,
      ids,
    )
    jobs = jobResult.rowCount ?? 0
    const noteResult = await pool.query(
      `delete from oxana.notifications
       where source_id = any($1::uuid[])
          or ${ids.map((_, index) => `body like '%' || $${index + 2} || '%'`).join(' or ')}`,
      [ids, ...ids],
    )
    notes = noteResult.rowCount ?? 0
  }
  console.log(
    JSON.stringify({
      tasks: tasks.rowCount ?? 0,
      events: events.rowCount ?? 0,
      projects: projects.rowCount ?? 0,
      jobs,
      notes,
    }),
  )
} finally {
  await closeOxanaPool()
}
