import { describe, expect, it } from 'vitest';
import { addTagsFromDraft, removeTagAt } from '../utils/assetTags';

describe('asset tag helpers', () => {
  it('turns comma and whitespace separated drafts into unique chips', () => {
    expect(addTagsFromDraft(['青衣'], '夜景, 特写  青衣')).toEqual(['青衣', '夜景', '特写']);
  });

  it('ignores empty drafts', () => {
    expect(addTagsFromDraft(['青衣'], '  , ， ')).toEqual(['青衣']);
  });

  it('removes one tag by index', () => {
    expect(removeTagAt(['青衣', '夜景', '特写'], 1)).toEqual(['青衣', '特写']);
  });
});
