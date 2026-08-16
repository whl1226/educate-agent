import sys, re, io
import numpy as np
import pdfplumber
from PIL import Image
from rapidocr_onnxruntime import RapidOCR

# 期望每页应出现的关键词（用于核对内容完整性）
EXPECT = {
    "作品简介": {
        1: ["乡芽", "乡镇教育智能体", "作答", "BKT", "最近发展区", "LangGraph", "39"],
    },
    "方案PPT": {
        1:  ["乡芽", "作答", "进步", "AI+教育"],
        2:  ["梅岭", "初心", "被看见", "8.6万所"],
        3:  ["教师", "学生", "家长", "治理", "我们的回答"],
        4:  ["四端一脑", "38", "Agent", "工作台", "16 个教育工具"],
        5:  ["学生作答", "BKT", "ZPD", "班级学情看板", "区域治理看板"],
        6:  ["意图理解", "工具调用", "流式交付", "引用校验", "SSE"],
        7:  ["班级学情", "王秀兰", "BKT", "掌握度"],
        8:  ["一键备课", "一师多科", "generate_lesson_plan", "引用"],
        9:  ["一键组卷", "A/B/C", "分层", "知识点"],
        10: ["教研员", "128", "依据透明"],
        11: ["今日任务", "ZPD", "打卡", "掌握度"],
        12: ["苏格拉底", "不给答案", "状态机", "引导"],
        13: ["认知诊断", "BKT", "证据题", "置信"],
        14: ["学情周报", "老师寄语", "掌握度", "脱敏"],
        15: ["语音留言", "双向陪伴", "播报", "未成年人"],
        16: ["区域学情看板", "数据上卷", "治理", "18"],
        17: ["城乡资源均衡", "缺口", "督导", "双师"],
        18: ["家访", "闭环", "预警", "复核"],
        19: ["督导任务", "闭环率", "预警", "复核"],
        20: ["LangGraph", "RAG", "BKT", "ZPD", "双模式", "安全基线"],
        21: ["开源", "试点", "辐射", "规模", "生态", "可持续"],
        22: ["不给标准答案", "不替代教师评价", "数据脱敏", "越权"],
        23: ["39", "16", "38", "MIT", "授权费", "可落地"],
        24: ["梅岭", "孩子", "被看见", "乡芽"],
    },
}

def ocr_text(engine, pil_img):
    arr = np.array(pil_img.convert("RGB"))[:, :, ::-1]  # RGB -> BGR for RapidOCR
    result, _ = engine(arr)
    if not result:
        return ""
    return "".join(r[1] for r in result)

def render_page(pdf_path, idx, scale=2.0):
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[idx]
        return page.to_image(resolution=72 * scale).original

def main(pdf_path, name):
    with pdfplumber.open(pdf_path) as pdf:
        n = len(pdf.pages)
    print(f"\n===== OCR 自检 · {name} · {n} 页 =====")
    engine = RapidOCR()
    problems = []
    for i in range(n):
        img = render_page(pdf_path, i)
        text = ocr_text(engine, img)
        text_nospace = re.sub(r"\s+", "", text)
        exp = EXPECT.get(name, {}).get(i + 1, [])
        # 关键词也做去空白处理，避免 OCR 在词间插入/删除空格造成误报
        missing = [k for k in exp if re.sub(r"\s+", "", k) not in text_nospace]
        # 检测豆腐块/异常字符
        tofu = text.count("\ufffd")
        status = "OK" if not missing and tofu == 0 else "⚠️"
        if missing or tofu:
            problems.append((i + 1, missing, tofu))
        print(f"[{i+1:2d}] {status}  字数={len(text_nospace):3d}  缺失={missing if missing else '无'}  豆腐块={tofu}")
    print("---")
    if problems:
        print("存在问题:", problems)
    else:
        print("全部通过 ✅  无缺失关键词、无豆腐块")
    return problems

if __name__ == "__main__":
    name = sys.argv[1]
    pdf = sys.argv[2]
    problems = main(pdf, name)
    sys.exit(1 if problems else 0)
