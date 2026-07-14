import json
import re

with open('channel.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Find ytInitialData
match = re.search(r'var ytInitialData = (\{.*?\});</script>', content)
if not match:
    # Try another pattern
    match = re.search(r'window\["ytInitialData"\] = (\{.*?\});', content)

if match:
    data = json.loads(match.group(1))
    
    # Extract channel info
    try:
        header = data.get('header', {}).get('c4TabbedHeaderRenderer', {})
        print(f"Channel Name: {header.get('title')}")
        
        avatar = header.get('avatar', {}).get('thumbnails', [{}])[0].get('url')
        print(f"Avatar: {avatar}")
        
        banner = header.get('banner', {}).get('thumbnails', [{}])[-1].get('url')
        print(f"Banner: {banner}")
        
        subs = header.get('subscriberCountText', {}).get('simpleText')
        print(f"Subscribers: {subs}")
        
        vcount = header.get('videoCountText', {}).get('runs', [{}])[0].get('text')
        print(f"Video Count: {vcount}")

        # Description is often in metadata or a different object
        # metadata = data.get('metadata', {}).get('channelMetadataRenderer', {})
        # print(f"Description: {metadata.get('description')}")
    except Exception as e:
        print(f"Error parsing header: {e}")

    # Extract videos
    videos = []
    # Search for videoRenderer in the whole JSON structure
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

    find_videos(data)
    print("\nVideos:")
    for v in videos[:10]:
        print(f"Title: {v['title']}, ID: {v['id']}")

    # Social links
    # Usually in data['header']['c4TabbedHeaderRenderer']['headerLinks']
    links = []
    try:
        link_data = header.get('headerLinks', {}).get('channelHeaderLinksRenderer', {})
        primary = link_data.get('primaryLinks', [])
        secondary = link_data.get('secondaryLinks', [])
        for l in primary + secondary:
            links.append(l.get('title', {}).get('simpleText') + ": " + l.get('navigationEndpoint', {}).get('commandMetadata', {}).get('webCommandMetadata', {}).get('url'))
    except:
        pass
    print("\nLinks:")
    for l in links:
        print(l)

else:
    print("Could not find ytInitialData")

# Also find description from metadata
match_meta = re.search(r'name="description" content="([^"]+)"', content)
if match_meta:
    print(f"\nDescription Meta: {match_meta.group(1)}")

