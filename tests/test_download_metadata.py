import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('update_download',Path(__file__).parents[1]/'scripts/update-download.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class DownloadTests(unittest.TestCase):
    def setUp(self):
        self.html=(Path(__file__).parents[1]/'start.html').read_text('utf-8')
        self.tag='tm-v1.0.159'
        self.url=f'https://github.com/ilseoeng/ilseoeng.github.io/releases/download/{self.tag}/Tm_setup.msi'
    def test_next_release_preserves_design_and_guide(self):
        result=module.update_html(self.html,self.tag,self.url,'2026-10-16T03:00:00Z')
        self.assertIn(self.url,result)
        self.assertIn('class="btn" data-i18n="guide.download"',result)
        self.assertIn('assets/screens/mobile-settings.svg',result)
        self.assertIn('id="phone"',result)
        self.assertIn('tm-v1.0.159</strong> (2026-10-16)',result)
        self.assertEqual(self.html.split('id="pc"',1)[1],result.split('id="pc"',1)[1])
    def test_external_installer_is_rejected(self):
        with self.assertRaises(ValueError):module.update_html(self.html,self.tag,'https://example.com/file.msi','2026-10-16')
    def test_non_tm_release_is_rejected(self):
        with self.assertRaises(ValueError):module.update_html(self.html,'v9.0.0',self.url,'2026-10-16')
    def test_missing_or_duplicate_targets_fail_without_writing(self):
        for html in [self.html.replace('id="download-btn"','id="other"'),self.html+self.html]:
            with self.assertRaises(ValueError):module.update_html(html,self.tag,self.url,'2026-10-16')
if __name__=='__main__':unittest.main()
