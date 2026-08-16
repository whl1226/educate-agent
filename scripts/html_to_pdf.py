import subprocess
import sys
from pathlib import Path

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

def html_to_pdf(html_path: str, pdf_path: str, budget_ms: int = 15000):
    html_path = Path(html_path).resolve().as_uri()
    pdf_path = Path(pdf_path).resolve()
    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    if pdf_path.exists():
        pdf_path.unlink()
    cmd = [
        EDGE,
        "--headless",
        "--disable-gpu",
        "--no-pdf-header-footer",
        "--run-all-compositor-stages-before-draw",
        f"--virtual-time-budget={budget_ms}",
        f"--print-to-pdf={pdf_path}",
        html_path,
    ]
    subprocess.run(cmd, check=True, timeout=120)
    print(f"PDF saved: {pdf_path}")

if __name__ == "__main__":
    html_to_pdf(sys.argv[1], sys.argv[2])
