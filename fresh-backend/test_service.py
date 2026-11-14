import unittest
from service import compare, ExtractionError

P = {'synthetic_only': True, 'earlier': {'source_id':'old', 'text':'Earlier list: Aspirin.'},
     'later': {'source_id':'new', 'text':'Later list: Ibuprofen.'}}
class CompareTests(unittest.TestCase):
    def test_comparison_preserves_source_evidence(self):
        answers = iter(['{"medications":["Aspirin"]}', '{"medications":["Ibuprofen"]}'])
        result = compare(P, lambda _: next(answers))
        self.assertEqual([x['kind'] for x in result['differences']], ['earlier_only', 'later_only'])
        evidence = result['differences'][0]['evidence'][0]
        self.assertEqual(P['earlier']['text'][evidence['start']:evidence['end']], 'Aspirin')
        self.assertTrue(result['review_required'])
    def test_unsupported_hallucination_is_not_a_mention(self):
        answers = iter(['{"medications":["warfarin"]}', '{"medications":[]}'])
        result = compare(P, lambda _: next(answers))
        self.assertEqual(result['earlier']['unsupported_outputs'], ['warfarin'])
        self.assertEqual(result['differences'], [])
    def test_bare_json_array_is_checked_against_source(self):
        answers = iter(['["Aspirin"]', '["Ibuprofen"]'])
        self.assertEqual(len(compare(P, lambda _:next(answers))['differences']), 2)
    def test_invalid_output_does_not_fabricate_removal(self):
        answers = iter(['{"medications":["Aspirin"]}', 'not json'])
        with self.assertRaises(ExtractionError): compare(P, lambda _: next(answers))
    def test_synthetic_and_source_validation(self):
        with self.assertRaises(ValueError): compare({**P, 'synthetic_only':False}, lambda _: '{}')
        with self.assertRaises(ValueError): compare({**P, 'later':P['earlier']}, lambda _: '{}')
    def test_substring_is_not_accepted_inside_a_word(self):
        answers = iter(['{"medications":["spirin"]}', '{"medications":[]}'])
        self.assertEqual(compare(P, lambda _:next(answers))['earlier']['mentions'], [])

if __name__ == '__main__': unittest.main()
