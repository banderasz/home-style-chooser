import { useCallback, useState } from 'react'

const TAGS_KEY = 'home-style-chooser/show-tags'

/**
 * The tag overlay preference, shared by both decks so turning it on in one doesn't leave
 * the other showing bare photos.
 *
 * Default off: seeing "Art Deco" before you swipe means partly rating the label. Turn it
 * on when you want to check how the catalog is tagged.
 */
export function useShowTags(): [boolean, () => void] {
  const [showTags, setShowTags] = useState(() => {
    try {
      return localStorage.getItem(TAGS_KEY) === 'on'
    } catch {
      return false
    }
  })

  const toggle = useCallback(() => {
    setShowTags((on) => {
      try {
        localStorage.setItem(TAGS_KEY, on ? 'off' : 'on')
      } catch {
        // Private mode — the toggle just won't persist.
      }
      return !on
    })
  }, [])

  return [showTags, toggle]
}
