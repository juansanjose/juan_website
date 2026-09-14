#!/usr/bin/env python3
"""Build the public AI library from a local bookmark export (never publish the raw export)."""
import argparse
import collections
import html
import json
from pathlib import Path
import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]

def canonical(url):
    p = urlsplit(url.strip())
    host = (p.hostname or '').lower().removeprefix('www.')
    host = {'twitter.com': 'x.com', 'youtu.be': 'youtube.com'}.get(host, host)
    path = p.path.rstrip('/')
    query = [(k, v) for k, v in parse_qsl(p.query) if not k.startswith('utm_') and k not in {'fbclid', 'gclid', 'si', 'poc_token', 'isFreemail', 'post_id', 'publication_id', 'r', 'triedRedirect', 'referralCode', 'couponCode'}]
    if host == 'arxiv.org':
        path = re.sub(r'^/(pdf|html)/', '/abs/', path)
        path = re.sub(r'(v\d+)?(\.pdf)?$', '', path)
    if host == 'youtube.com':
        video = dict(query).get('v') or (path.strip('/') if p.hostname == 'youtu.be' else None)
        if video:
            path, query = '/watch', [('v', video)]
    if host == 'x.com':
        path = re.sub(r'/(photo|video)/\d+$', '', path)
    return urlunsplit((p.scheme.lower(), host + (':' + str(p.port) if p.port and p.port not in {80, 443} else ''), path, urlencode(sorted(query)), ''))

def resource_key(url):
    """Identify format aliases without merging distinct documentation versions."""
    p = urlsplit(canonical(url))
    host = p.netloc
    path = re.sub(r'/index\.html$', '', p.path).rstrip('/')
    if host == 'dl.acm.org':
        path = re.sub(r'^/doi/(?:pdf|epdf|abs|full)/', '/doi/', path)
    if host in {'arxiv.org', 'alphaxiv.org'}:
        host = 'arxiv.org'
        path = re.sub(r'^/(?:pdf|html)/', '/abs/', path)
        path = re.sub(r'(?:v\d+)?(?:\.pdf)?$', '', path)
    if host == 'docs.nvidia.com' and path in {
        '/datacenter/tesla/pdf/fabric-manager-user-guide.pdf',
        '/datacenter/tesla/fabric-manager-user-guide',
        '/hgx-platforms/fabric-manager-user-guide',
    }:
        path = '/hgx-platforms/fabric-manager-user-guide'
    return urlunsplit(('https', host, path, p.query, ''))


def title_key(title):
    title = html.unescape(title).casefold()
    title = re.sub(r'^\[\d{4}\.\d+(?:v\d+)?\]\s*', '', title)
    title = re.sub(r'^paper page\s*-\s*', '', title)
    title = re.split(r'\s+[|—]\s+', title)[0]
    return re.sub(r'\s+', ' ', title).strip()


def career_resource(title, url):
    # "Jobs" also means compute workloads, so avoid a blanket job-word filter.
    text = title + ' ' + url
    return bool(re.search(
        r'careers?|interviews?|hiring|recruit(?:ment|ing|er)?|glassdoor|'
        r'igotanoffer|datainterview|techinterview|cover[- ]letter|'
        r'job[- /](?:openings?|offers?|search|application|details|vacanc)|'
        r'employment|oportunidades profesionales|'
        r'certification|certifications|certified[- ]professional|certified[- ]associate|'
        r'\bexam\b|examtopics|ncp-ai|nca-ai|ccnp', text, re.I))


def organize(source):
    tree = json.loads((ROOT / 'site/data/topic_tree.json').read_text())
    topics = [topic for group in tree for topic in group['topics']]
    kept, removed, seen = [], [], {}
    seen_titles = set()
    # Reuse descriptive titles from other copies of the same URL.
    best = {}
    for item in source:
        key = canonical(item.get('url', ''))
        if len(item.get('title', '')) > len(best.get(key, '')):
            best[key] = item.get('title', '')
    for item in source:
        title = html.unescape(item.get('title', '')).strip()
        raw = item.get('url', '')
        p = urlsplit(raw)
        url = canonical(raw)
        host = urlsplit(url).hostname or ''
        title = html.unescape(best.get(url, title)).strip()
        text = title + ' ' + url
        reason = None
        if p.scheme not in {'http', 'https'} or not p.hostname or p.username or p.password:
            reason = 'Local or invalid URL'
        elif host in {'chatgpt.com', 'chat.openai.com', 'gemini.google.com', 'claude.ai', 'mail.google.com', 'drive.google.com', 'docs.google.com', 'instagram.com'} or host.endswith('.instagram.com'):
            reason = 'Personal content or account page'
        elif re.search(r'Buscar con Google|Google Search|^\(?\d*\)?\s*YouTube$|log in|sign in|not found|error 404|access denied|just a moment|attention required|captcha', title, re.I) or (host == 'google.com' and p.path == '/search'):
            reason = 'Search, login, or unusable bookmark'
        topic = next((t['id'] for t in topics if re.search(t['pattern'], title, re.I)), None)
        if not topic:
            topic = next((t['id'] for t in topics if re.search(t['pattern'], url, re.I)), None)
        if not topic and re.search(r'\bAI\b', title):
            topic = 'foundations'
        if re.search(r'careers?\.|jobs\.|/careers(?:/|$)|/auth/|/jobs/|/login|/sign-in|/my-certification|/registration/|/search[/?]|/cart|/assessment/', url, re.I) or host.startswith(('app.', 'auth.')) or host == 'linkedin.com' and not p.path.startswith('/blog/'):
            reason = 'Personal content or account page'
        if re.search(r'career opportunities|careers in|jobs: join|oportunidades profesionales|job details', title, re.I):
            reason = 'Personal content or account page'
        if host == 'x.com' and (title.startswith(('x.com/', 'https://x.com/'))):
            reason = 'Social post needs content review'
        if not reason and not topic:
            reason = 'No clear AI or supporting systems topic in bookmark metadata'
        if not reason and host == 'x.com' and '/status/' not in p.path:
            reason = 'Social profile rather than a topic resource'
        if career_resource(title, url):
            reason = 'Career, interview, or certification resource'
        identity = resource_key(url)
        if not reason and identity in seen:
            reason = 'Duplicate URL'
        # Match paper titles across publisher/repository suffixes, but preserve
        # manuals, generic page headings, and distinct documentation versions.
        key = title_key(title)
        generic = re.search(r'support portal|documentation|user guide|manual|overview|powerpoint|slide|\.pdf$|\.dvi$|^\d|fabric manager', key)
        documentation = re.search(r'://docs\.|documentation|readthedocs', url)
        if not reason and len(key) > 25 and not generic and not documentation and key in seen_titles:
            reason = 'Duplicate title'
        if reason:
            removed.append({**item, 'reason': reason})
        else:
            seen[identity] = True
            if not generic and not documentation:
                seen_titles.add(key)
            kept.append({'title': title, 'url': url, 'topic': topic})
    return kept, removed

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--review', type=Path, default=Path('/tmp/links-review.json'))
    args = parser.parse_args()
    source = json.loads(args.source.read_text())
    kept, removed = organize(source)
    (ROOT / 'site/data/links.json').write_text(json.dumps(kept, ensure_ascii=False, indent=2) + '\n')
    args.review.write_text(json.dumps(removed, ensure_ascii=False, indent=2) + '\n')
    stats = {'input': len(source), 'retained': len(kept), 'removed': dict(collections.Counter(x['reason'] for x in removed)), 'topics': dict(collections.Counter(x['topic'] for x in kept))}
    (ROOT / 'docs/link-cleanup.json').write_text(json.dumps(stats, indent=2) + '\n')
    print(json.dumps(stats, indent=2))
