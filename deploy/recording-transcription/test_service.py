import io
import struct
import unittest
import wave

from service import inspect_wav


def pcm_wav(samples):
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setparams((1, 2, 16000, 0, "NONE", ""))
        audio.writeframes(struct.pack("<" + str(len(samples)) + "h", *samples))
    return output.getvalue()


class RecordingInspectionTests(unittest.TestCase):
    def test_zero_signal_at_duration_limit(self):
        self.assertEqual(inspect_wav(pcm_wav([0] * 480_000)), (30_000, True))

    def test_constant_nonzero_signal(self):
        self.assertEqual(inspect_wav(pcm_wav([-200] * 1600)), (100, True))

    def test_varying_signal(self):
        self.assertEqual(inspect_wav(pcm_wav([0, 1] * 800)), (100, False))

    def test_declared_samples_must_be_present(self):
        with self.assertRaisesRegex(ValueError, "invalid WAV length"):
            inspect_wav(pcm_wav([0] * 1600)[:-2])


if __name__ == "__main__":
    unittest.main()
