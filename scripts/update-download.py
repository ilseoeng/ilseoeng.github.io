"""Update release metadata without replacing the guide's styled HTML elements."""
import argparse
import re
from pathlib import Path

def update_html(html, tag, url, published_at):
    if not re.fullmatch(r'tm-v\d+\.\d+\.\d+', tag):
        raise ValueError('Not a TM release tag')
    expected=f'https://github.com/ilseoeng/ilseoeng.github.io/releases/download/{tag}/Tm_setup.msi'
    if url!=expected:
        raise ValueError('Unexpected installer URL')
    date=published_at[:10]
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date):
        raise ValueError('Invalid publication date')
    pattern=r'<a\b[^>]*\bid=[\x22\x27]download-btn[\x22\x27][^>]*>'
    def link(match):
        result,count=re.subn(r'\bhref=([\x22\x27]).*?\1','href="'+url+'"',match[0])
        if count!=1:raise ValueError('Expected one download href')
        return result
    html,count=re.subn(pattern,link,html,flags=re.S)
    if count!=1:raise ValueError('Expected one download button')
    pattern=r'(<(?P<tag>div|p)\b[^>]*\bid=[\x22\x27]version-text[\x22\x27][^>]*>).*?(</(?P=tag)>)'
    html,count=re.subn(pattern,lambda m:m[1]+f'Ver: <strong>{tag}</strong> ({date})'+m[3],html,flags=re.S)
    if count!=1:raise ValueError('Expected one version label')
    return html

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--file',default='start.html');p.add_argument('--tag',required=True)
    p.add_argument('--url',required=True);p.add_argument('--published-at',required=True)
    a=p.parse_args();file=Path(a.file)
    result=update_html(file.read_text('utf-8'),a.tag,a.url,a.published_at)
    file.write_text(result,encoding='utf-8',newline='\n')
