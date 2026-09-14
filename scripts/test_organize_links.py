import unittest
from organize_links import canonical, organize

class CleanupTests(unittest.TestCase):
    def test_paper_versions(self):
        self.assertEqual(canonical('https://arxiv.org/pdf/2506.20252v1.pdf'), canonical('https://arxiv.org/abs/2506.20252'))

    def test_video_and_social_variants(self):
        self.assertEqual(canonical('https://youtu.be/abc?si=tracking'), canonical('https://www.youtube.com/watch?v=abc&t=42&list=playlist'))
        self.assertEqual(canonical('https://twitter.com/person/status/123/photo/1'), canonical('https://x.com/person/status/123'))

    def test_meaningful_query_and_port(self):
        self.assertEqual(canonical('http://example.org:8083/paper?id=42&utm_source=feed#page2'), 'http://example.org:8083/paper?id=42')
        self.assertNotEqual(canonical('https://example.org/paper?id=42'), canonical('https://example.org/paper?id=43'))

    def test_filtering(self):
        source = [
            {'title': 'GPU kernels on X', 'url': 'https://x.com/a/status/1'},
            {'title': 'Holiday vlog - YouTube', 'url': 'https://youtube.com/watch?v=personal'},
            {'title': 'AI private chat', 'url': 'https://chatgpt.com/c/private'},
            {'title': 'NVIDIA', 'url': 'https://nvidia.com/auth/gtc?state=private'},
            {'title': 'x.com/chips/status/2', 'url': 'https://x.com/chips/status/2'},
            {'title': 'CUDA lecture - YouTube', 'url': 'https://youtube.com/watch?v=lecture'},
        ]
        kept, removed = organize(source)
        self.assertEqual(len(kept), 2)
        self.assertEqual(len(removed), 4)

    def test_duplicates_and_better_title(self):
        kept, removed = organize([
            {'title': '1234.12345', 'url': 'https://arxiv.org/pdf/1234.12345'},
            {'title': 'Distributed training with many GPUs', 'url': 'https://arxiv.org/abs/1234.12345'},
        ])
        self.assertEqual(len(kept), 1)
        self.assertEqual(kept[0]['topic'], 'training')
        self.assertEqual(removed[0]['reason'], 'Duplicate URL')

    def test_tracking_removed(self):
        self.assertEqual(canonical('https://example.org/article?poc_token=private&utm_source=feed'), 'https://example.org/article')

if __name__ == '__main__':
    unittest.main()
