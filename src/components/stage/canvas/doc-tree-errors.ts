type Localize = (zhCN: string, enUS: string) => string

/**
 * 资料树错误码 → 作者能照着做的说明。主进程只回码，文案在这里按界面语言写，
 * 中英各一份，避免主边界出现未本地化文案。
 */
const DOC_TREE_ERRORS: Record<string, [zhCN: string, enUS: string]> = {
  DOC_TREE_SOURCES_CHANGED: [
    '角色、章节或线索刚有更新，资料树要先重新载入再改。',
    'Roles, chapters or threads just changed. Reload the tree before editing.',
  ],
  DOC_TREE_NODE_NOT_FOUND: [
    '这个节点已经不在了，重新载入看看现在的树。',
    'That node is no longer there. Reload to see the current tree.',
  ],
  DOC_TREE_PARENT_NOT_FOUND: [
    '目标文件夹不在了，重新载入后再拖。',
    'The target folder is gone. Reload and try again.',
  ],
  DOC_TREE_PARENT_NOT_FOLDER: [
    '文档和画布下不能再放东西，换一个文件夹。',
    'Documents and canvases cannot hold children. Pick a folder.',
  ],
  DOC_TREE_PARENT_TRASHED: [
    '目标文件夹在回收站里，先把它恢复出来。',
    'The target folder is in the trash. Restore it first.',
  ],
  DOC_TREE_NODE_TRASHED: [
    '这个节点在回收站里，先恢复再改。',
    'This node is in the trash. Restore it before editing.',
  ],
  DOC_TREE_CYCLE_DETECTED: [
    '不能把节点挪进它自己或它下面的层级。',
    'A node cannot move into itself or its own subtree.',
  ],
  DOC_TREE_NODE_LOCKED: [
    '这个节点已锁定，先解锁再改。',
    'This node is locked. Unlock it first.',
  ],
  DOC_TREE_TITLE_INVALID: [
    '标题不能为空。',
    'A title cannot be empty.',
  ],
  DOC_TREE_SAVE_FAILED: [
    '保存没成功，资料树没有改动，再试一次。',
    'Could not save. The tree is unchanged; try again.',
  ],
  DOC_TREE_CLEAR_FAILED: [
    '清空没成功，资料树没有改动。',
    'Could not clear the tree; nothing changed.',
  ],
  PROJECT_NOT_OPEN: [
    '作品已经关掉了，重新打开再操作。',
    'The book is closed. Reopen it to continue.',
  ],
}

export function docTreeErrorMessage(input: string | undefined, text: Localize): string {
  const code = (input ?? '').match(/DOC_TREE_[A-Z_]+|PROJECT_NOT_OPEN/)?.[0]
  const entry = code ? DOC_TREE_ERRORS[code] : undefined
  if (entry) return text(entry[0], entry[1])
  return text('操作没成功，再试一次。', 'That did not work. Try again.')
}
