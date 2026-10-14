// Interface words the page adds itself, in the document's language.
export const UI = {
  de: {
    skip: 'Zum Inhalt springen',
    page: 'Seite',
    previous: 'statt',
    table: 'Tabelle',
    contents: 'Inhalt',
    sections: 'Bereiche',
  },
  en: {
    skip: 'Skip to content',
    page: 'Page',
    previous: 'was',
    table: 'Table',
    contents: 'Contents',
    sections: 'Sections',
  },
}
export type Strings = (typeof UI)['de']
