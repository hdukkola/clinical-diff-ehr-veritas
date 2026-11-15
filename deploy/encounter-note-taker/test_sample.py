import unittest

from service import check_sample_facts


class SampleFactTests(unittest.TestCase):
    facts = [
        {"text": "The discharge note lists Lisinopril 20mg daily."},
        {"text": "It does not say whether aspirin was stopped."},
        {"text": "I will check the original instructions."},
    ]

    def test_transcript_preserves_all_required_facts(self):
        self.assertEqual(check_sample_facts(self.facts), [])

    def test_unrecognizable_name_or_wrong_dose_is_held(self):
        for line, expected in [
            ("The discharge note lists this in April, 20 milligrams daily.", ["medication", "dose"]),
            ("The discharge note lists Lisinopril 40mg daily.", ["dose"]),
        ]:
            with self.subTest(line=line):
                self.assertEqual(check_sample_facts([{"text": line}, *self.facts[1:]]), expected)

    def test_selected_lines_must_preserve_uncertainty_and_the_follow_up(self):
        self.assertEqual(check_sample_facts(self.facts[:1]), ["uncertainty", "followUp"])


if __name__ == "__main__":
    unittest.main()
