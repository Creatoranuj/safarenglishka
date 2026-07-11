import json
import re

def parse(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract Subs and Videos
    subs = re.search(r'([0-9.]+[KMB]? subscribers)', content)
    vcount = re.search(r'([0-9,]+ videos)', content)
    
    print(f"Subscribers: {subs.group(1) if subs else 'Not found'}")
    print(f"Video Count: {vcount.group(1) if vcount else 'Not found'}")

    # Extract Banner
    banner = re.search(r'"banner":\{"thumbnails":\[\{"url":"(https:[^"]+)"', content)
    if not banner:
        banner = re.search(r'"imageBannerViewModel":\{"image":\{"sources":\[\{"url":"(https:[^"]+)"', content)
    print(f"Banner: {banner.group(1) if banner else 'Not found'}")

    # Extract Videos
    # Pattern for videoRenderer
    video_matches = re.finditer(r'"videoRenderer":\{"videoId":"([^"]+)","thumbnail":\{"thumbnails":\[\{"url":"([^"]+)".*?"title":\{"runs":\[\{"text":"([^"]+)"', content)
    videos = []
    seen = set()
    for m in video_matches:
        vid, thumb, title = m.groups()
        if vid not in seen:
            videos.append((title, vid))
            seen.add(vid)
    
    print("\nRecent Videos:")
    for t, v in videos[:6]:
        print(f"Title: {t}, ID: {v}, Thumbnail: https://i.ytimg.com/vi/{v}/hqdefault.jpg")

parse('channel.html')
