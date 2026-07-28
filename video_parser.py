import json
import re

def parse_yt_data(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    match = re.search(r'var ytInitialData = (\{.*?\});</script>', content)
    if not match:
        match = re.search(r'window\["ytInitialData"\] = (\{.*?\});', content)
    if match:
        return json.loads(match.group(1))
    return None

v_data = parse_yt_data('videos.html')
if v_data:
    # Find videos in tabs
    videos = []
    def find_videos(obj):
        if isinstance(obj, dict):
            if 'videoRenderer' in obj:
                v = obj['videoRenderer']
                title = v.get('title', {}).get('runs', [{}])[0].get('text')
                vid = v.get('videoId')
                videos.append({'title': title, 'id': vid})
            for k, v in obj.items():
                find_videos(v)
        elif isinstance(obj, list):
            for item in obj:
                find_videos(item)
    find_videos(v_data)
    print("Recent Videos:")
    for v in videos[:6]:
        print(f"Title: {v['title']}, ID: {v['id']}")

a_data = parse_yt_data('about.html')
if a_data:
    # YouTube redesigned About page, it's often in a dialog or side panel now
    # But channel metadata is still there
    header = a_data.get('header', {}).get('c4TabbedHeaderRenderer', {})
    print(f"Subscribers: {header.get('subscriberCountText', {}).get('simpleText')}")
    print(f"Videos Count: {header.get('videoCountText', {}).get('runs', [{}])[0].get('text')}")
    
    # Check for banner in about page header
    banner = header.get('banner', {}).get('thumbnails', [{}])[-1].get('url')
    print(f"Banner: {banner}")

    # Description and links are sometimes in metadata
    meta = a_data.get('metadata', {}).get('channelMetadataRenderer', {})
    if meta:
        print(f"Description: {meta.get('description')}")
        print(f"External Links: {meta.get('externalId')}")

