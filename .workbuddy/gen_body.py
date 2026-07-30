import urllib.request, base64, json

# 尝试下载真实面料图，失败则用纯色图
urls = [
    "https://images.pexels.com/photos/45062/fabric-texture-pattern-colorful-45062.jpeg?w=400",
    "https://placehold.co/120x120/1a3a5a/ffffff.png",
]
raw = None
for u in urls:
    try:
        req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
        raw = urllib.request.urlopen(req, timeout=25).read()
        print("下载成功:", u, len(raw), "字节")
        break
    except Exception as e:
        print("下载失败:", u, e)

if not raw:
    raise SystemExit("无可用图片")

b64 = base64.b64encode(raw).decode()
mime = "image/jpeg" if raw[:2] == b"\xff\xd8" else "image/png"
body = {
    "model": "gpt-5.4",
    "messages": [{
        "role": "user",
        "content": [
            {"type": "text", "text": "识别这块面料的特征，严格返回JSON：{\"color\":\"主色\",\"texture\":\"纹理\",\"composition\":\"成分\",\"weight\":\"克重\",\"width\":\"门幅\",\"gloss\":\"光泽\"}。只返回JSON，不要解释。"},
            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}}
        ]
    }],
    "max_tokens": 150
}
with open("C:/Users/zs/Desktop/111/.workbuddy/vision_body.json", "w") as f:
    json.dump(body, f)
print("vision_body.json 已生成", len(json.dumps(body)), "字节")
