// Interface words the page adds itself, in the document's language.
export const UI = {
  de: {
    skip: 'Zum Inhalt springen',
    page: 'Seite',
    previous: 'statt',
    table: 'Tabelle',
    contents: 'Inhalt',
    sections: 'Bereiche',
    view: 'Seitenansicht',
    printed: 'Wie gedruckt',
    textOnly: 'Nur Text',
  },
  en: {
    skip: 'Skip to content',
    page: 'Page',
    previous: 'was',
    table: 'Table',
    contents: 'Contents',
    sections: 'Sections',
    view: 'Page view',
    printed: 'As printed',
    textOnly: 'Text only',
  },
}
export type Strings = (typeof UI)['de']
