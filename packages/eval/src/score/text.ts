import { canon } from '@make-it-accessible/pipeline/text/normalize'

// Whitespace-, case- and hyphen-blind form for finding key text in the rendered page.
export const loose = (s: string): string => canon(s).replace(/[-\u2010\u2011]/g, '')
