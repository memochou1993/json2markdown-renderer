import * as stryle from '@memochou1993/stryle';

const toTitleCase = (str: unknown) => stryle.toTitleCase(String(str), {
  specialTerms: [
    'HTML',
    'ID$',
    'JSON',
  ],
});

export default toTitleCase;
