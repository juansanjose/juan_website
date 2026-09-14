import unittest
from organize_links import canonical, organize, resource_key

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

class CareerAndDuplicateTests(unittest.TestCase):
    def test_career_filter_preserves_compute_jobs(self):
        kept, removed = organize([
            {'title': 'NVIDIA interview preparation', 'url': 'https://example.org/interview'},
            {'title': 'AI Networking Certification', 'url': 'https://example.org/certification'},
            {'title': 'Slurm job scheduling', 'url': 'https://example.org/slurm'},
            {'title': 'Multi-GPU programming bootcamp', 'url': 'https://example.org/gpu'},
        ])
        self.assertEqual(len(kept), 2)
        self.assertTrue(all(x['reason'] == 'Career, interview, or certification resource' for x in removed))

    def test_publisher_suffix_duplicates(self):
        kept, removed = organize([
            {'title': 'Revisiting network support for RDMA | Proceedings of a conference', 'url': 'https://example.org/paper'},
            {'title': '[1806.08159] Revisiting Network Support for RDMA', 'url': 'https://arxiv.org/abs/1806.08159'},
        ])
        self.assertEqual(len(kept), 1)
        self.assertEqual(removed[0]['reason'], 'Duplicate title')

    def test_format_aliases(self):
        self.assertEqual(resource_key('https://dl.acm.org/doi/epdf/10.1/abc'), resource_key('https://dl.acm.org/doi/10.1/abc'))
        self.assertEqual(resource_key('https://docs.nvidia.com/cuda/gpudirect-rdma/index.html'), resource_key('https://docs.nvidia.com/cuda/gpudirect-rdma/'))
        self.assertEqual(resource_key('https://alphaxiv.org/abs/2402.15627'), resource_key('https://arxiv.org/abs/2402.15627'))

    def test_generic_titles_and_versions_are_distinct(self):
        source = [
            {'title': 'NVIDIA Enterprise Support Portal | RDMA routing', 'url': 'https://enterprise-support.nvidia.com/routing'},
            {'title': 'NVIDIA Enterprise Support Portal | RDMA headers', 'url': 'https://enterprise-support.nvidia.com/headers'},
            {'title': 'NVLink Partition Management — NVIDIA Documentation', 'url': 'https://docs.nvidia.com/2.1/nvlink'},
            {'title': 'NVLink Partition Management — NVIDIA Documentation', 'url': 'https://docs.nvidia.com/2.2/nvlink'},
        ]
        kept, removed = organize(source)
        self.assertEqual(len(kept), 4)
        self.assertEqual(removed, [])

class TopicSeparationTests(unittest.TestCase):
    def test_storage_os_and_programming_are_separate(self):
        cases = [
            ('Lustre filesystem', 'storage'),
            ('Virtual Memory: Page Tables, TLBs, and Linux Internals', 'systems'),
            ('An Introduction to IOMMU Infrastructure in the Linux Kernel', 'systems'),
            ('Modern C - Jens Gustedt', 'programming'),
            ('Function Pointers and Callbacks in C', 'programming'),
            ('Mount Mayhem: Scaling Containers on Modern CPUs', 'clusters'),
            ('Developing a Linux Kernel module using RDMA for GPUDirect', 'kernels'),
        ]
        for n, (title, expected) in enumerate(cases):
            with self.subTest(title=title):
                kept, removed = organize([{'title': title, 'url': f'https://example.org/resource/{n}'}])
                self.assertEqual(removed, [])
                self.assertEqual(kept[0]['topic'], expected)

if __name__ == '__main__':
    unittest.main()
