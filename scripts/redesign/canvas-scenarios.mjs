import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import { chooseProjectDirectoryGrant } from '../project-directory-grant.mjs'
import * as stage from './pages/stage.mjs'

const BOOK = '灯塔测绘'

/** 用真实 IPC 建一棵资料树：两层文件夹、文档与画布混排，回收站里留一项用来截第二张图。 */
async function seedDocTree({ app, page, roots, invoke, trash = false }) {
  // 本机 Linux 没有安全文件系统实现（fs:list-dir 抛 SECURE_FS_UNSUPPORTED_PLATFORM，Windows/macOS 才有），
  // 打开作品后会弹「部分数据加载失败」并遮住流程脊。这个通道与本切片无关，打桩成空目录。
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('fs:list-dir')
    ipcMain.handle('fs:list-dir', () => [])
  })
  const created = await invoke(page, 'project:create', { parentGrantId: (await chooseProjectDirectoryGrant(app, page, roots.projects)).grantId,
    name: BOOK, genre: '悬疑', targetAudience: '成年读者', writingLanguage: 'zh-CN' }, randomUUID(), null)
  assert.equal(created.success, true, created.error)
  const opened = await invoke(page, 'project:open', created.projectPath, randomUUID(), null)
  assert.equal(opened.success, true, opened.error)
  const path = created.projectPath
  const session = { projectId: created.projectId, projectPath: path, leaseId: opened.project.sessionLease }
  let revision = (await invoke(page, 'db:doc-tree-read', path, session)).sources.sourceRevision
  const create = async input => {
    const result = await invoke(page, 'db:doc-tree-node-create', { origin: 'human', ...input }, revision, path, session)
    assert.equal(result.success, true, result.error ?? result.errorCode)
    revision = result.snapshot.sourceRevision
    return result.node
  }
  const volume = await create({ parentId: null, kind: 'folder', title: '第一卷 · 潮汐之下' })
  const archive = await create({ parentId: volume.id, kind: 'folder', title: '灯塔档案' })
  await create({ parentId: archive.id, kind: 'document', title: '潮汐测绘笔记' })
  await create({ parentId: archive.id, kind: 'document', title: '灯塔值班表' })
  await create({ parentId: archive.id, kind: 'canvas', title: '灯塔关系图' })
  const cast = await create({ parentId: null, kind: 'folder', title: '人物' })
  await create({ parentId: cast.id, kind: 'document', title: '林岚' })
  await create({ parentId: null, kind: 'canvas', title: '全书脑图' })
  if (trash) {
    const result = await invoke(page, 'doc-tree:trash-node', cast.id, revision, path, session)
    assert.equal(result.success, true, result.error ?? result.errorCode)
  }
  return { path, revision }
}

/** 打开作品并切到侧栏树；folders 是要展开的文件夹标题。 */
async function dismissLoadFailure(page) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const confirm = page.getByRole('alertdialog').getByRole('button', { name: '确定', exact: true })
    if (!(await confirm.isVisible().catch(() => false))) break
    await confirm.click()
    await page.getByRole('alertdialog').waitFor({ state: 'detached', timeout: 5_000 }).catch(() => {})
  }
}

async function openCanvasWithTree(page, { expand = [] } = {}) {
  // 提示弹层会遮住流程脊：本机 Linux 上 fs:list-dir 走安全文件系统（只支持 win/mac），打开作品后必弹「部分数据加载失败」。
  // 这是宿主平台限制，不是这一次改动引入的，点掉它再继续；打开作品后还会再弹一次。
  await dismissLoadFailure(page)
  if (await stage.root(page).count() > 0) await stage.openFromLibrary(page, BOOK)
  await dismissLoadFailure(page)
  await page.locator('.stage-row[data-resource="canvas"]').click()
  await page.locator('.stage-doc-tree').waitFor({ state: 'visible', timeout: 20_000 })
  await page.locator('.stage-doc-tree-name').first().waitFor({ state: 'visible' })
  for (const title of expand) {
    const row = page.locator('.stage-doc-tree-row').filter({ has: page.locator('.stage-doc-tree-name', { hasText: title }) })
    await row.locator('.stage-doc-tree-toggle').click()
  }
  await page.locator('.stage-doc-tree').getByRole('heading', { name: '资料树' }).waitFor({ state: 'visible' })
}

const rowOf = (page, title) => page.locator('.stage-doc-tree-row')
  .filter({ has: page.locator('.stage-doc-tree-name', { hasText: title }) })

export const CANVAS_SCENARIOS = {
  'canvas-doc-tree': { model: false, shell: 'stage', setup: async context => {
    await seedDocTree(context)
    await context.reload()
  }, run: async ({ page }) => {
    await openCanvasWithTree(page, { expand: ['第一卷 · 潮汐之下', '灯塔档案', '人物'] })
    const names = await page.locator('.stage-doc-tree-name').allTextContents()
    assert.deepEqual(names, ['第一卷 · 潮汐之下', '灯塔档案', '潮汐测绘笔记', '灯塔值班表', '灯塔关系图', '人物', '林岚', '全书脑图'],
      '层级展开后按序号排出八个节点')
    assert.equal(await page.locator('.stage-doc-tree-rename').count(), 0)
  } },

  'canvas-doc-tree-edit': { model: false, shell: 'stage', setup: async context => {
    await seedDocTree(context)
    await context.reload()
  }, run: async ({ page }) => {
    await openCanvasWithTree(page, { expand: ['第一卷 · 潮汐之下', '灯塔档案', '人物'] })
    // 双击改名：内联输入框回车提交。
    const cast = rowOf(page, '林岚')
    await cast.locator('.stage-doc-tree-name').dblclick()
    const input = page.locator('.stage-doc-tree-rename')
    await input.waitFor({ state: 'visible' })
    await input.fill('林岚 · 测绘师')
    await input.press('Enter')
    await page.locator('.stage-doc-tree-name', { hasText: '林岚 · 测绘师' }).waitFor({ state: 'visible' })
    // 行菜单软删：整棵子树进回收站。
    await rowOf(page, '人物').getByRole('button', { name: /更多操作/ }).click()
    await page.getByRole('menuitem', { name: /移到回收站/ }).click()
    await rowOf(page, '人物').waitFor({ state: 'detached' })
    // 关掉标签再重开：这一步让侧栏重新从库里读一次，确认改名与删除都落了库。
    await stage.closeTabButton(page, '自由画布').click()
    await page.locator('.stage-doc-tree').waitFor({ state: 'detached' })
    await page.locator('.stage-row[data-resource="canvas"]').click()
    await page.locator('.stage-doc-tree').waitFor({ state: 'visible' })
    assert.equal(await page.locator('.stage-doc-tree-name', { hasText: '人物' }).count(), 0, '删掉的文件夹不再出现在树里')
    await page.getByRole('button', { name: '资料树操作' }).click()
    await page.getByRole('menuitem', { name: '回收站' }).click()
    await page.locator('.stage-doc-tree-trash-row').first().waitFor({ state: 'visible' })
    await page.getByRole('button', { name: '恢复', exact: true }).click()
    await page.locator('.stage-doc-tree-trash-row').first().waitFor({ state: 'detached' })
    await page.getByRole('button', { name: '回资料树', exact: true }).first().click()
    // 重开标签后展开状态是新的一轮，恢复回来的文件夹默认折叠。
    await rowOf(page, '人物').locator('.stage-doc-tree-toggle').click()
    await page.locator('.stage-doc-tree-name', { hasText: '林岚 · 测绘师' }).waitFor({ state: 'visible' })
    assert.equal(await page.locator('.stage-doc-tree-name', { hasText: '人物' }).count(), 1, '恢复后文件夹回到树里')
    assert.equal(await page.locator('.stage-doc-tree-name', { hasText: '林岚 · 测绘师' }).count(), 1, '改名随恢复一起留下')
  } },

  'canvas-doc-tree-trash': { model: false, shell: 'stage', setup: async context => {
    await seedDocTree({ ...context, trash: true })
    await context.reload()
  }, run: async ({ page }) => {
    await openCanvasWithTree(page)
    await page.getByRole('button', { name: '资料树操作' }).click()
    await page.getByRole('menuitem', { name: '回收站' }).click()
    await page.locator('.stage-doc-tree-trash-row').first().waitFor({ state: 'visible' })
    assert.equal(await page.locator('.stage-doc-tree-trash-row').count(), 1, '整棵子树的删除在回收站里只算一项')
    assert.match(await page.locator('.stage-doc-tree-meta').first().textContent(), /含 2 个节点/)
  } },
}
