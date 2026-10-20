import { getLang } from '../lib/i18n'
import { nameMeaning } from './nameMeanings'

// A place name's meaning for a player not reading Turkish ("Altınkapı" → "Golden Gate"). The name itself stays
// Turkish for everyone, since the lobby is shared; Turkish readers see nothing.
export function NameNote({ name }: { name: string | undefined }) {
  if (getLang() === 'tr' || !name) return null
  const meaning = nameMeaning(name)
  return meaning ? <i className="name-note">“{meaning}”</i> : null
}
