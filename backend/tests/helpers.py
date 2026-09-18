"""Change real workbook XML only inside temporary test fixtures."""

import io
import zipfile
from xml.etree import ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def changed(raw, sheet="sheet5.xml", cell="D13", value="2027", text=False):
    output = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(raw)) as source, zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as target:
        for item in source.infolist():
            content = source.read(item.filename)
            if item.filename == f"xl/worksheets/{sheet}":
                root = ET.fromstring(content)
                node = next(c for c in root.iter(f"{NS}c") if c.attrib["r"] == cell)
                for child in list(node):
                    node.remove(child)
                node.attrib.pop("t", None)
                if value is not None:
                    if text:
                        node.set("t", "inlineStr")
                        ET.SubElement(ET.SubElement(node, f"{NS}is"), f"{NS}t").text = value
                    else:
                        ET.SubElement(node, f"{NS}v").text = value
                content = ET.tostring(root)
            target.writestr(item.filename, content)
    return output.getvalue()


def rename_sheets(raw):
    output = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(raw)) as source, zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as target:
        for item in source.infolist():
            content = source.read(item.filename)
            if item.filename == "xl/workbook.xml":
                root = ET.fromstring(content)
                for index, sheet in enumerate(root.iter(f"{NS}sheet")):
                    sheet.set("name", f"Aba {index}")
                content = ET.tostring(root)
            target.writestr(item.filename, content)
    return output.getvalue()
