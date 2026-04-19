from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs" / "assets"
OUT_DIR.mkdir(parents=True, exist_ok=True)

FONT_REGULAR = r"C:\Windows\Fonts\msyh.ttc"
FONT_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"

COLOR_BG = "#FFF9F6"
COLOR_PRIMARY = "#8D1B1B"
COLOR_STROKE = "#B71C1C"
COLOR_TEXT = "#202124"
COLOR_SUB = "#666666"
COLOR_FILL = "#FFFFFF"
COLOR_HIGHLIGHT = "#FDECEC"


def font(size: int, bold: bool = False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REGULAR, size=size)


def draw_box(draw, xy, fill=COLOR_FILL, outline=COLOR_STROKE, width=2, radius=0):
    if radius:
        draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)
    else:
        draw.rectangle(xy, fill=fill, outline=outline, width=width)


def draw_circle(draw, center, radius, fill=COLOR_FILL, outline=COLOR_STROKE, width=3):
    x, y = center
    draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill, outline=outline, width=width)


def draw_datastore(draw, xy, fill=COLOR_FILL, outline=COLOR_STROKE, width=2):
    x1, y1, x2, y2 = xy
    draw.rectangle((x1, y1, x2, y2), fill=fill, outline=outline, width=width)
    draw.line((x1 + 18, y1, x1 + 18, y2), fill=outline, width=width)


def centered_text(draw, box, text, text_font, fill=COLOR_TEXT, spacing=6):
    x1, y1, x2, y2 = box
    lines = text.split("\n")
    bboxes = [draw.textbbox((0, 0), line, font=text_font) for line in lines]
    heights = [b[3] - b[1] for b in bboxes]
    total_h = sum(heights) + spacing * (len(lines) - 1)
    cy = y1 + ((y2 - y1) - total_h) / 2
    for line, bbox, line_h in zip(lines, bboxes, heights):
        line_w = bbox[2] - bbox[0]
        cx = x1 + ((x2 - x1) - line_w) / 2
        draw.text((cx, cy), line, font=text_font, fill=fill)
        cy += line_h + spacing


def draw_multiline(draw, x, y, lines, text_font, fill=COLOR_TEXT, spacing=10):
    cy = y
    for line in lines:
        draw.text((x, cy), line, font=text_font, fill=fill)
        bbox = draw.textbbox((x, cy), line, font=text_font)
        cy += (bbox[3] - bbox[1]) + spacing


def arrow(draw, start, end, fill=COLOR_PRIMARY, width=3, head=14):
    draw.line([start, end], fill=fill, width=width)
    x1, y1 = start
    x2, y2 = end
    if abs(x2 - x1) >= abs(y2 - y1):
        if x2 >= x1:
            pts = [(x2, y2), (x2 - head, y2 - head // 2), (x2 - head, y2 + head // 2)]
        else:
            pts = [(x2, y2), (x2 + head, y2 - head // 2), (x2 + head, y2 + head // 2)]
    else:
        if y2 >= y1:
            pts = [(x2, y2), (x2 - head // 2, y2 - head), (x2 + head // 2, y2 - head)]
        else:
            pts = [(x2, y2), (x2 - head // 2, y2 + head), (x2 + head // 2, y2 + head)]
    draw.polygon(pts, fill=fill)


def label(draw, pos, text, size=16, fill=COLOR_SUB, anchor="mm"):
    draw.text(pos, text, font=font(size), fill=fill, anchor=anchor)


def crow_label(draw, pos, text):
    draw.text(pos, text, font=font(16, bold=True), fill=COLOR_PRIMARY, anchor="mm")


def draw_table_entity(draw, xy, title, fields):
    x1, y1, x2, y2 = xy
    draw_box(draw, xy, fill=COLOR_FILL, outline=COLOR_STROKE, width=2, radius=0)
    header_h = 42
    draw.rectangle((x1, y1, x2, y1 + header_h), fill="#FFF0F0", outline=COLOR_STROKE, width=2)
    centered_text(draw, (x1, y1, x2, y1 + header_h), title, font(18, bold=True), fill=COLOR_PRIMARY)
    draw.line((x1, y1 + header_h, x2, y1 + header_h), fill=COLOR_STROKE, width=2)
    draw_multiline(draw, x1 + 14, y1 + header_h + 10, fields, font(15), fill=COLOR_TEXT, spacing=6)


def render_dfd():
    img = Image.new("RGB", (1800, 1120), COLOR_BG)
    draw = ImageDraw.Draw(img)

    draw.text((56, 28), "数据流图（DFD，标准记法）", font=font(34, bold=True), fill=COLOR_PRIMARY)
    draw.text((56, 76), "符号约定：矩形表示外部实体，圆形表示处理过程，开口矩形表示数据存储，箭头表示数据流。", font=font(18), fill=COLOR_SUB)

    externals = {
        "e1": (70, 170, 250, 240, "外部实体 E1\n入党申请人"),
        "e2": (70, 350, 250, 440, "外部实体 E2\n基层管理角色"),
        "e3": (70, 540, 250, 620, "外部实体 E3\n组织部 / 超级管理员"),
    }
    processes = {
        "p1": ((470, 210), 86, "P1\n小程序办理"),
        "p2": ((470, 400), 86, "P2\n后台办理"),
        "p3": ((930, 320), 110, "P3\n统一业务处理"),
    }
    stores = {
        "d1": (1300, 150, 1600, 240, "D1 业务数据库\nMySQL"),
        "d2": (1300, 320, 1600, 410, "D2 附件存储\n上传文件目录"),
    }

    for _, (x1, y1, x2, y2, text) in externals.items():
        draw_box(draw, (x1, y1, x2, y2), fill=COLOR_FILL, outline=COLOR_STROKE, width=2)
        centered_text(draw, (x1, y1, x2, y2), text, font(20, bold=True), fill=COLOR_TEXT)

    for _, (center, radius, text) in processes.items():
        draw_circle(draw, center, radius, fill=COLOR_HIGHLIGHT if text.startswith("P3") else COLOR_FILL, outline=COLOR_STROKE, width=3)
        centered_text(draw, (center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius), text, font(22, bold=True), fill=COLOR_PRIMARY if text.startswith("P3") else COLOR_TEXT)

    for _, (x1, y1, x2, y2, text) in stores.items():
        draw_datastore(draw, (x1, y1, x2, y2))
        centered_text(draw, (x1 + 18, y1, x2, y2), text, font(21, bold=True), fill=COLOR_TEXT)

    arrow(draw, (250, 205), (384, 205))
    label(draw, (318, 186), "登录 / 填报 / 上传", 16)

    arrow(draw, (250, 395), (384, 395))
    label(draw, (318, 374), "审核 / 查询 / 统计", 16)

    arrow(draw, (250, 580), (384, 430))
    label(draw, (326, 520), "配置 / 导出 / 全局管理", 16)

    arrow(draw, (556, 250), (820, 290))
    label(draw, (674, 248), "业务请求", 16)

    arrow(draw, (556, 400), (820, 350))
    label(draw, (688, 378), "后台请求", 16)

    arrow(draw, (1040, 270), (1300, 195))
    label(draw, (1172, 214), "业务数据读写", 16)
    arrow(draw, (1300, 225), (1040, 300))

    arrow(draw, (1040, 345), (1300, 365))
    label(draw, (1172, 344), "附件读写", 16)
    arrow(draw, (1300, 392), (1040, 380))

    arrow(draw, (1040, 340), (384, 220))
    label(draw, (710, 248), "查询结果 / 状态回显", 15)
    arrow(draw, (1040, 390), (384, 455))
    label(draw, (710, 452), "审核结果 / 统计结果 / 导出结果", 15)

    note = (300, 760, 1680, 1020)
    draw_box(draw, note, fill=COLOR_FILL, outline="#D7CCC8", width=2, radius=12)
    draw.text((330, 790), "说明：", font=font(22, bold=True), fill=COLOR_PRIMARY)
    lines = [
        "1. 本图按 DFD 常规元素表达主链路，重点区分“外部实体、处理过程、数据存储、数据流”。",
        "2. 为避免概念混淆，Excel 导出在本图中视为 P3 的输出结果，不单独作为数据存储绘制。",
        "3. 当前图反映的是逻辑主流程，不代表备份、告警、异常补偿等运维链路已经全部实现。",
        "4. 小程序与后台最终都通过统一业务处理过程访问数据库和附件存储，符合当前系统结构。",
    ]
    draw_multiline(draw, 335, 835, lines, font(18), fill=COLOR_TEXT, spacing=14)

    img.save(OUT_DIR / "report-dfd.png", optimize=True)


def render_er():
    img = Image.new("RGB", (2200, 1500), COLOR_BG)
    draw = ImageDraw.Draw(img)

    draw.text((40, 20), "实体关系图（ER，严格版）", font=font(34, bold=True), fill=COLOR_PRIMARY)
    draw.text((40, 68), "表达方式：实体表 + 主键/外键字段 + 基数关系。仅绘制当前表结构中可明确成立的核心关系。", font=font(18), fill=COLOR_SUB)

    entities = {
        "users": (40, 120, 320, 320, "USERS", ["PK id", "username", "password_hash", "name", "status", "FK org_id", "FK branch_id", "created_at"]),
        "org_units": (430, 120, 650, 240, "ORG_UNITS", ["PK id", "name"]),
        "branches": (760, 120, 1000, 260, "BRANCHES", ["PK id", "name", "FK org_id"]),
        "roles": (40, 420, 260, 560, "ROLES", ["PK id", "label", "scope_level"]),
        "user_roles": (340, 400, 620, 570, "USER_ROLES", ["PK id", "FK user_id", "FK role_id", "UNIQUE(user_id, role_id)"]),
        "permissions": (720, 420, 940, 540, "PERMISSIONS", ["PK id", "label"]),
        "role_permissions": (1040, 390, 1370, 590, "ROLE_PERMISSIONS", ["PK id", "FK role_id", "FK permission_id", "UNIQUE(role_id, permission_id)"]),
        "registration_requests": (40, 650, 330, 880, "REGISTRATION_REQUESTS", ["PK id", "request_no", "FK user_id", "name", "id_no", "employee_no", "status", "created_at", "reviewed_at"]),
        "applicant_profiles": (420, 650, 760, 930, "APPLICANT_PROFILES", ["PK id", "FK user_id", "current_stage", "phone", "education", "degree", "unit_name", "occupation", "profile_json", "updated_at"]),
        "user_profiles": (860, 650, 1150, 850, "USER_PROFILES", ["PK id", "FK user_id", "profile_type", "profile_json", "updated_at"]),
        "wechat_bindings": (1250, 650, 1600, 930, "WECHAT_BINDINGS", ["PK id", "FK user_id", "openid", "unionid", "session_key_encrypted", "nickname", "avatar_url", "status", "bound_at", "last_login_at"]),
        "audit_logs": (40, 1040, 340, 1280, "AUDIT_LOGS", ["PK id", "target_type", "target_id", "action", "FK operator_id", "detail_json", "created_at"]),
        "workflow_instances": (450, 1060, 760, 1220, "WORKFLOW_INSTANCES", ["PK id", "FK applicant_id", "current_stage", "updated_at"]),
        "step_records": (860, 1020, 1180, 1280, "WORKFLOW_STEP_RECORDS", ["PK id", "FK instance_id", "FK step_code", "status", "form_data_json", "review_comment", "FK last_operator_id", "operated_at", "deadline"]),
        "step_defs": (1280, 1020, 1640, 1260, "WORKFLOW_STEP_DEFINITIONS", ["PK step_code", "sort_order", "name", "phase", "allowed_roles_json", "form_schema_json", "start_at", "end_at"]),
        "attachments": (860, 1330, 1160, 1490, "ATTACHMENTS", ["PK id", "FK step_record_id", "file_name", "file_url", "mime_type", "created_at"]),
    }

    for _, (x1, y1, x2, y2, title, fields) in entities.items():
        draw_table_entity(draw, (x1, y1, x2, y2), title, fields)

    def pt(name, side):
        x1, y1, x2, y2, *_ = entities[name]
        return {
            "left": (x1, (y1 + y2) // 2),
            "right": (x2, (y1 + y2) // 2),
            "top": ((x1 + x2) // 2, y1),
            "bottom": ((x1 + x2) // 2, y2),
        }[side]

    def relation(points, start_label, end_label, start_pos, end_pos):
        draw.line(points, fill=COLOR_PRIMARY, width=3)
        crow_label(draw, start_pos, start_label)
        crow_label(draw, end_pos, end_label)

    relation([pt("org_units", "right"), pt("branches", "left")], "1", "N", (660, 150), (750, 150))
    relation([pt("users", "right"), (380, 210), pt("org_units", "left")], "N", "1", (330, 212), (420, 176))
    relation([pt("branches", "bottom"), (900, 290), (350, 290), (350, 250), pt("users", "right")], "1", "N", (900, 276), (330, 252))
    relation([pt("users", "bottom"), (180, 370), pt("user_roles", "top")], "1", "N", (196, 336), (480, 385))
    relation([pt("roles", "right"), pt("user_roles", "left")], "1", "N", (270, 480), (330, 480))
    relation([pt("roles", "right"), (980, 480), pt("role_permissions", "left")], "1", "N", (270, 452), (1030, 452))
    relation([pt("permissions", "right"), pt("role_permissions", "left")], "1", "N", (950, 455), (1030, 455))
    relation([pt("users", "bottom"), (110, 620), pt("registration_requests", "top")], "1", "N", (125, 336), (185, 635))
    relation([pt("users", "bottom"), (240, 610), pt("applicant_profiles", "top")], "1", "0..1", (255, 336), (590, 635))
    relation([pt("users", "right"), (820, 220), (820, 620), pt("user_profiles", "top")], "1", "0..1", (335, 196), (1005, 635))
    relation([pt("users", "right"), (1210, 220), (1210, 620), pt("wechat_bindings", "top")], "1", "0..1", (335, 182), (1425, 635))
    relation([pt("users", "bottom"), (140, 1000), pt("audit_logs", "top")], "1", "N", (156, 336), (190, 1024))
    relation([pt("applicant_profiles", "bottom"), pt("workflow_instances", "top")], "1", "1", (590, 945), (605, 1044))
    relation([pt("workflow_instances", "right"), pt("step_records", "left")], "1", "N", (770, 1140), (850, 1140))
    relation([pt("step_defs", "left"), pt("step_records", "right")], "1", "N", (1270, 1140), (1190, 1140))
    relation([pt("step_records", "bottom"), pt("attachments", "top")], "1", "N", (1020, 1295), (1020, 1315))

    note = (1680, 50, 2160, 250)
    draw_box(draw, note, fill=COLOR_FILL, outline="#D7CCC8", width=2, radius=10)
    draw.text((1710, 80), "读图说明：", font=font(22, bold=True), fill=COLOR_PRIMARY)
    lines = [
        "1. 本图只保留能够在当前表结构中严格成立的主外键关系。",
        "2. AUDIT_LOGS 使用 target_type / target_id 多态指向目标，因此未把所有业务目标都画成硬外键。",
        "3. USER_PROFILES 与 APPLICANT_PROFILES 已经分离，体现不同角色资料结构差异。",
        "4. WORKFLOW_STEP_RECORDS 通过 instance_id 与 step_code 同时关联流程实例和步骤定义。",
    ]
    draw_multiline(draw, 1715, 122, lines, font(15), fill=COLOR_TEXT, spacing=10)

    img.save(OUT_DIR / "report-er.png", optimize=True)


if __name__ == "__main__":
    render_dfd()
    render_er()
