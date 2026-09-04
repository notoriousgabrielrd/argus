import type { StateCreator } from 'zustand'
import type { AppState } from '../types'

export type ObsidianOpenNote = {
  vaultId: string
  vaultName: string
  notePath: string
}

export type ObsidianSlice = {
  /** Note shown by the Obsidian page; null while no note has been opened. */
  obsidianOpenNote: ObsidianOpenNote | null
  /** Opens a note on the Obsidian page and switches the main area to it. */
  openObsidianNote: (note: ObsidianOpenNote) => void
  closeObsidianNote: () => void
}

export const createObsidianSlice: StateCreator<AppState, [], [], ObsidianSlice> = (set) => ({
  obsidianOpenNote: null,
  // Why: notes are not workspace files, so they get their own main-area view
  // instead of a workspace tab — opening one must not create a project.
  openObsidianNote: (note) => set({ obsidianOpenNote: note, activeView: 'obsidian' }),
  closeObsidianNote: () => set({ obsidianOpenNote: null })
})
