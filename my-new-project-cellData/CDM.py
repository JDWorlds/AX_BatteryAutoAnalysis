from flask import Flask, jsonify, request
from flask_cors import CORS  # CORS 라이브러리 추가
import psycopg2
import os
import io
import base64
import uuid
from fpdf import FPDF
import matplotlib
matplotlib.use('Agg')  # GUI 없는 백엔드로 설정

import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import pandas as pd
import json, re
import matplotlib as mpl
from itertools import cycle

# ✅ 한글 폰트 적용
base_dir = os.path.dirname(os.path.abspath(__file__))
font_path = os.path.join(base_dir, "LGEITextTTF-Regular.ttf")  # 같은 경로의 폰트 파일
fm.fontManager.addfont(font_path)
font_prop = fm.FontProperties(fname=font_path)
plt.rcParams["font.family"] = font_prop.get_name()
plt.rcParams["axes.unicode_minus"] = False

app = Flask(__name__)
CORS(app)  # 모든 도메인에서 요청을 허용

# PostgreSQL 연결 설정
conn = psycopg2.connect(
    dbname='chat_memory',
    user='n8n_user',
    password='securepassword123',
    host='localhost',
    port='5432'
)
cur = conn.cursor()

@app.route('/api/cells', methods=['GET'])
def get_cells():
    search_query = request.args.get('search', '')  # 검색 조건 가져오기
    if search_query:
        cur.execute("SELECT cell_id, charge_policy, cycle_life FROM cells WHERE cell_id LIKE %s;", (f"%{search_query}%",))
    else:
        cur.execute("SELECT cell_id, charge_policy, cycle_life FROM cells;")
    rows = cur.fetchall()
    cells = [{"cell_id": row[0], "charge_policy": row[1], "cycle_life": row[2]} for row in rows]
    return jsonify(cells)

@app.route('/api/cycle_summaries', methods=['GET'])
def get_cycle_summaries():
    cell_id = request.args.get('cell_id')
    cur.execute("SELECT cycle_index, ir, q_charge, q_discharge, tavg, tmin, tmax, chargetime FROM cycle_summaries WHERE cell_id = %s;", (cell_id,))
    rows = cur.fetchall()
    summaries = []
    for row in rows:
        if len(row) < 8:  # 튜플 길이가 부족한 경우 기본값 설정
            summaries.append({
                "cycle_index": row[0] if len(row) > 0 else None,
                "ir": row[1] if len(row) > 1 else None,
                "q_charge": row[2] if len(row) > 2 else None,
                "q_discharge": row[3] if len(row) > 3 else None,
                "tavg": row[4] if len(row) > 4 else None,
                "tmin": row[5] if len(row) > 5 else None,
                "tmax": row[6] if len(row) > 6 else None,
                "chargetime": row[7] if len(row) > 7 else None,
            })
        else:
            summaries.append({
                "cycle_index": row[0],
                "ir": row[1],
                "q_charge": row[2],
                "q_discharge": row[3],
                "tavg": row[4],
                "tmin": row[5],
                "tmax": row[6],
                "chargetime": row[7],
            })
    return jsonify(summaries)

@app.route('/api/cycle_timeseries', methods=['GET'])
def get_cycle_timeseries():
    cell_id = request.args.get('cell_id')
    cycle_index = request.args.get('cycle_index')

    if not cell_id:
        return jsonify({"error": "missing cell_id"}), 400

    # 쿼리: cycle_index가 있으면 해당 사이클만, 없으면 기존과 동일하게 전체 반환
    if cycle_index is not None:
        try:
            ci = int(float(cycle_index))
        except Exception:
            return jsonify({"error": "cycle_index must be an integer"}), 400
        cur.execute(
            """
            SELECT time, current, voltage, q_charge, q_discharge, temperature
            FROM cycle_timeseries
            WHERE cell_id = %s AND cycle_index = %s
            ORDER BY time
            """,
            (cell_id, ci),
        )
    else:
        cur.execute(
            """
            SELECT time, current, voltage, q_charge, q_discharge, temperature
            FROM cycle_timeseries
            WHERE cell_id = %s
            ORDER BY time
            """,
            (cell_id,),
        )

    rows = cur.fetchall()

    # JSON 직렬화 안전 변환
    def conv(v):
        try:
            # psycopg2 Decimal 등 숫자는 float로, datetime은 isoformat
            from decimal import Decimal
            from datetime import datetime, date
            if isinstance(v, Decimal):
                return float(v)
            if isinstance(v, (datetime, date)):
                return v.isoformat()
        except Exception:
            pass
        return v

    timeseries = [
        {
            "time": conv(r[0]),
            "current": conv(r[1]),
            "voltage": conv(r[2]),
            "q_charge": conv(r[3]),
            "q_discharge": conv(r[4]),
            "temperature": conv(r[5]),
        }
        for r in rows
    ]
    # 포함된 키에 따라 단위 맵 구성
    present_keys = set(timeseries[0].keys()) if timeseries else set()
    default_units = {
        "current": "A",
        "voltage": "V",
        "q_charge": "Ah",
        "q_discharge": "Ah",
        "temperature": "°C",
        "ir": "Ω",
    }
    units = {k: v for k, v in default_units.items() if k in present_keys}

    # rows + units + x(축 키)로 응답 (프론트는 배열/객체 모두 호환 처리)
    return jsonify({
        "rows": timeseries,
        "units": units,
        "x": "time",
    })

# n8n에서 온 결과 기반으로 PDF 파일 생성하기
@app.route('/api/generate_image_base64', methods=['POST'])
def generate_image_base64():
    data = request.get_json()
    cell_id = data["cell_id"]
    segment_range = data["segment"].replace("–", "-")  # 유니코드 처리
    start, end = [int(float(x.strip())) for x in segment_range.split("-")]

    # PostgreSQL 조회
    cur.execute("""
        SELECT cycle_index, ir, q_discharge, q_charge
        FROM cycle_summaries
        WHERE cell_id = %s AND cycle_index BETWEEN %s AND %s
        ORDER BY cycle_index;
    """, (cell_id, start, end))
    rows = cur.fetchall()

    if not rows:
        return jsonify({"error": "No data found"}), 404

    df = pd.DataFrame(rows, columns=["cycle_index", "ir", "q_discharge", "q_charge"])

    # 그래프 생성
    fig, ax1 = plt.subplots()
    color1 = 'tab:blue'
    color2 = 'tab:orange'

    ax1.set_xlabel("Cycle Index")
    ax1.set_ylabel("IR", color=color1)
    ax1.plot(df["cycle_index"], df["ir"], color=color1, label="IR")
    ax1.tick_params(axis='y', labelcolor=color1)

    ax2 = ax1.twinx()
    ax2.set_ylabel("Qd", color=color2)
    ax2.plot(df["cycle_index"], df["q_discharge"], color=color2, linestyle='--', label="Qd")
    ax2.tick_params(axis='y', labelcolor=color2)

    fig.tight_layout()

    # 고유 파일명 생성
    GRAPH_FOLDER = os.path.join("static", "graphs")
    filename = f"chart_{uuid.uuid4().hex}.png"
    file_path = os.path.join(GRAPH_FOLDER, filename)

    # 디렉토리 없으면 생성
    os.makedirs(GRAPH_FOLDER, exist_ok=True)

    # 메모리에 저장하고 base64 인코딩
    img_io = io.BytesIO()
    plt.savefig(file_path)
    plt.savefig(img_io, format='png')
    plt.close(fig)
    img_io.seek(0)
    img_base64 = base64.b64encode(img_io.read()).decode('utf-8')

    BASE_URL="http://host.docker.internal:5000"
    image_url = f"{BASE_URL}/static/graphs/{filename}"

    return jsonify({
        "image_url" : image_url,
        "image_base64": img_base64,
        "mime_type": "image/png"
    })

UNIT_HINT = {
    "avg_ir": "Ω", "ir": "Ω",
    "avg_qd": "Ah", "qd": "Ah",
    "avg_qc": "Ah", "qc": "Ah",
    "ce": "%", "soh": "%",
    "voltage": "V", "avg_voltage": "V",
    "current": "A", "avg_current": "A",
    "temperature": "°C", "avg_temp": "°C",
}

def infer_unit_or_label(label: str, explicit_unit: str = None) -> str:
    """unit 명시가 있으면 그 값, 없으면 라벨에서 추정. 그래도 없으면 라벨 문자열 자체를 반환."""
    if explicit_unit:
        return explicit_unit.strip()
    key = (label or "").strip()
    low = key.lower()
    if low in UNIT_HINT:
        return UNIT_HINT[low]
    # "(단위)" 괄호 표기 추출
    m = re.search(r"\(([^)]+)\)\s*$", key)
    if m:
        return m.group(1).strip()
    # 휴리스틱
    if "%" in key or "percent" in low:
        return "%"
    for u in ["mΩ","Ω","V","A","°C","K","Ah","mAh","Wh","W","C","s"]:
        if u.lower() in low:
            return u
    # 명확한 단위가 없다면 라벨 자체를 반환 → 라벨이 다르면 서로 다른 축으로 배치
    return key if key else "unitless"

def pad_limits(ymin, ymax, ratio=0.05):
    if ymin is None or ymax is None:
        return None, None
    if ymin == ymax:
        d = abs(ymax) * 0.05 if ymax != 0 else 1.0
        return ymin - d, ymax + d
    pad = (ymax - ymin) * ratio
    return ymin - pad, ymax + pad

def to_float_list(seq):
    out = []
    for v in seq:
        try:
            out.append(float(v))
        except Exception:
            out.append(float('nan'))
    return out

@app.route('/api/generate_image_base64FREE', methods=['POST'])
def generate_image_base64FREE():
    try:
        payload = request.get_json()
        # n8n/QuickChart 스타일로 배열이 올 때 첫 원소 사용
        if isinstance(payload, list):
            if not payload:
                return jsonify({"error": "empty payload"}), 400
            payload = payload[0]

        chart_type = payload.get("type", "line")
        data_block = payload.get("data", {})
        labels = data_block.get("labels", [])
        datasets = data_block.get("datasets", [])
        opts = payload.get("options", {})

        x_title = (((opts.get("scales") or {}).get("x") or {}).get("title") or {}).get("text", "x")
        y_title_default = (((opts.get("scales") or {}).get("y") or {}).get("title") or {}).get("text", "Value")
        title_text = ((opts.get("plugins") or {}).get("title") or {}).get("text", "Chart")

        # ---- 단위/라벨 기반 축 배치 ----
        # 각 dataset에 대해 unit 후보를 계산 (unit 명시 > 라벨에서 추론 > 라벨 자체)
        units = []
        labels_list = []
        for ds in datasets:
            label = ds.get("label", "") or ""
            labels_list.append(label)
            units.append(infer_unit_or_label(label, ds.get("unit")))

        # 공용 팔레트 → 매 dataset마다 다른 색 (요청 시 borderColor/color 우선)
        palette = mpl.rcParams['axes.prop_cycle'].by_key().get('color', [
            '#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd',
            '#8c564b','#e377c2','#7f7f7f','#bcbd22','#17becf'
        ])
        color_cycle = cycle(palette)

        # 유니크 단위(또는 라벨) → 첫 번째는 왼쪽, 두 번째는 오른쪽, 그 외는 오른쪽 재사용
        unique_units = []
        for u in units:
            if u not in unique_units:
                unique_units.append(u)

        fig, ax_left = plt.subplots(figsize=(8, 4.5))
        ax_right = ax_left.twinx() if len(unique_units) >= 2 else None

        unit_to_axis = {}
        if unique_units:
            unit_to_axis[unique_units[0]] = "left"
        if len(unique_units) >= 2:
            unit_to_axis[unique_units[1]] = "right"
        for extra in unique_units[2:]:
            unit_to_axis[extra] = "right"  # 3개 이상은 우측축 공유

        left_lines, right_lines = [], []
        left_min, left_max, right_min, right_max = None, None, None, None
        x_vals = to_float_list(labels)  # 숫자 변환(문자면 matplotlib가 자동 처리 가능하긴 함)

        # ---- 플로팅 ----
        for ds, unit in zip(datasets, units):
            y = to_float_list(ds.get("data", []))
            label = ds.get("label", unit or "series")
            axis_side = unit_to_axis.get(unit, "left")
            color = ds.get("borderColor") or ds.get("color") or next(color_cycle)

            if axis_side == "right" and ax_right is not None:
                ln, = ax_right.plot(x_vals, y, label=label, linewidth=2, color=color)
                right_lines.append(ln)
                # 범위
                vals = [v for v in y if v == v]  # NaN 제외
                if vals:
                    vmin, vmax = min(vals), max(vals)
                    right_min = vmin if right_min is None else min(right_min, vmin)
                    right_max = vmax if right_max is None else max(right_max, vmax)
            else:
                ln, = ax_left.plot(x_vals, y, label=label, linewidth=2, color=color)
                left_lines.append(ln)
                vals = [v for v in y if v == v]
                if vals:
                    vmin, vmax = min(vals), max(vals)
                    left_min = vmin if left_min is None else min(left_min, vmin)
                    left_max = vmax if left_max is None else max(left_max, vmax)

        # ---- 축/제목/범위/범례 ----
        ax_left.set_xlabel(x_title)
        # 축 제목: unit이 있으면 unit, 없으면 기본(y_title_default) 또는 라벨
        left_axis_title = unique_units[0] if unique_units else y_title_default
        ax_left.set_ylabel(left_axis_title or y_title_default)

        if ax_right is not None:
            right_axis_title = unique_units[1]
            ax_right.set_ylabel(right_axis_title)

        ymin, ymax = pad_limits(left_min, left_max, 0.05)
        if ymin is not None and ymax is not None:
            ax_left.set_ylim(ymin, ymax)

        if ax_right is not None:
            ymin2, ymax2 = pad_limits(right_min, right_max, 0.05)
            if ymin2 is not None and ymax2 is not None:
                ax_right.set_ylim(ymin2, ymax2)

        ax_left.set_title(title_text)
        ax_left.grid(True, which="both", axis="both", alpha=0.2)

        lines = left_lines + right_lines
        labels_for_legend = [l.get_label() for l in lines]
        if lines:
            ax_left.legend(lines, labels_for_legend, loc="best", frameon=False)

        # ---- 저장/응답 ----
        GRAPH_FOLDER = os.path.join("static", "graphs")
        os.makedirs(GRAPH_FOLDER, exist_ok=True)
        filename = f"chart_{uuid.uuid4().hex}.png"
        file_path = os.path.join(GRAPH_FOLDER, filename)

        img_io = io.BytesIO()
        plt.tight_layout()
        plt.savefig(file_path, dpi=150)
        plt.savefig(img_io, format='png', dpi=150)
        plt.close(fig)
        img_io.seek(0)
        img_base64 = base64.b64encode(img_io.read()).decode('utf-8')

        # 호스트 자동 감지(개발/배포 환경 모두 대응)
        BASE_URL = "http://127.0.0.1:5000"
        image_url = f"{BASE_URL}/static/graphs/{filename}"

        # 어떤 라벨이 어느 축에 갔는지 맵도 반환(디버그/프론트 표기용)
        label_axis_map = {}
        for ds, unit in zip(datasets, units):
            label_axis_map[ds.get("label", unit or "series")] = unit_to_axis.get(unit, "left")

        return jsonify({
            "image_url": image_url,
            "image_base64": img_base64,
            "mime_type": "image/png",
            "axes": {
                "left": unique_units[0] if unique_units else y_title_default,
                "right": unique_units[1] if len(unique_units) >= 2 else None
            },
            "label_axis_map": label_axis_map
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500



if __name__ == '__main__':
    app.run(host="127.0.0.1", debug=True)