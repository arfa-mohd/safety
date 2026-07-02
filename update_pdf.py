import sys
import re

with open(r'c:\safety\app.py', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = re.compile(r'    PRIMARY  = HexColor.*?return str\(pdf_path\)', re.DOTALL)

new_code = '''    PRIMARY  = HexColor('#991B1B') # Deep Crimson
    DARK     = HexColor('#1A1A1A')
    LIGHT    = HexColor('#F9FAFB')
    TEXT_GRAY= HexColor('#4B5563')
    WHITE    = HexColor('#FFFFFF')
    styles   = getSampleStyleSheet()
    story    = []

    # Title Header (Official Document Style)
    story.append(Paragraph(f"<font color='#991B1B' size='24'><b>OFFICIAL ROAD SAFETY REPORT</b></font>", ParagraphStyle('H1', alignment=1)))
    story.append(Paragraph(f"<font color='#4B5563' size='10'>TAMIL NADU GOVERNMENT - DEPARTMENT OF HIGHWAYS</font>", ParagraphStyle('H2', alignment=1)))
    story.append(Spacer(1,0.2*cm))
    story.append(HRFlowable(width="100%",thickness=2,color=PRIMARY))
    story.append(Spacer(1,0.5*cm))

    # Meta Info
    meta_data = [
        [Paragraph(f"<b>Report ID:</b> <font color='#991B1B'>{report_id[:8].upper()}</font>", styles['Normal']),
         Paragraph(f"<b>Date Generated:</b> {datetime.now().strftime('%d %b %Y, %I:%M %p')}", ParagraphStyle('r', alignment=2))]
    ]
    mt = Table(meta_data, colWidths=[8.5*cm, 8.5*cm])
    story += [mt, Spacer(1,0.6*cm)]

    # Reporter & Location
    info_s = ParagraphStyle('info', fontSize=9, textColor=DARK, leading=14)
    is_valid_coord = lat and str(lat) != '0' and str(lat) != '0.0' and str(lat).lower() != 'unknown'
    map_url = google_map_link or (f"https://maps.google.com/?q={lat},{lng}" if is_valid_coord else "")
    show_lat = lat if is_valid_coord else 'Unknown'
    show_lng = lng if is_valid_coord else 'Unknown'

    details_data = [
        [Paragraph("<b>REPORTER DETAILS</b>", styles['Normal']), Paragraph("<b>LOCATION DETAILS</b>", styles['Normal'])],
        [
            Paragraph(f"<b>Name:</b> {user.get('name','—')}<br/><b>Mobile:</b> {user.get('mobile','—')}<br/><b>Email:</b> {user.get('email','—')}", info_s),
            Paragraph(f"<b>Address:</b> {address or location_str}<br/><b>Coords:</b> {show_lat}, {show_lng}<br/><a href='{map_url}'><font color='#991B1B'><u>View on Google Maps</u></font></a>", info_s)
        ]
    ]
    dt_tbl = Table(details_data, colWidths=[8.5*cm, 8.5*cm])
    dt_tbl.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0), DARK),
        ('TEXTCOLOR',(0,0),(-1,0), WHITE),
        ('BACKGROUND',(0,1),(-1,1), LIGHT),
        ('GRID',(0,0),(-1,-1),0.5, HexColor('#D1D5DB')),
        ('PADDING',(0,0),(-1,-1),8),
    ]))
    story += [dt_tbl, Spacer(1,0.6*cm)]

    # Stats
    total_ph = sum(d.get('count',0) for d in detections_list)
    avg_conf = (sum(d.get('confidence',0) for d in detections_list)/len(detections_list)) if detections_list else 0
    severity = "HIGH" if total_ph>=5 else "MEDIUM" if total_ph>=2 else "LOW"
    sev_color = '#DC2626' if severity=='HIGH' else '#D97706' if severity=='MEDIUM' else '#16A34A'
    
    stats_data = [[
        Paragraph(f"<font color='#991B1B' size='20'><b>{max(total_ph, 0)}</b></font><br/><font size='9'>Total Potholes</font>", ParagraphStyle('c',alignment=1)),
        Paragraph(f"<font color='#991B1B' size='20'><b>{len(detections_list)}</b></font><br/><font size='9'>Images Scanned</font>", ParagraphStyle('c',alignment=1)),
        Paragraph(f"<font color='#991B1B' size='20'><b>{avg_conf*100:.0f}%</b></font><br/><font size='9'>Avg Confidence</font>", ParagraphStyle('c',alignment=1)),
        Paragraph(f"<font color='{sev_color}' size='16'><b>{severity}</b></font><br/><font size='9'>Severity Level</font>", ParagraphStyle('c',alignment=1)),
    ]]
    st = Table(stats_data, colWidths=[4.25*cm]*4)
    st.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,-1), WHITE),
        ('GRID',(0,0),(-1,-1),1, PRIMARY),
        ('ALIGN',(0,0),(-1,-1),'CENTER'),
        ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('PADDING',(0,0),(-1,-1),12),
    ]))
    story += [st, Spacer(1,0.6*cm)]

    # Frame Details
    story.append(Paragraph("<b>DETECTION BREAKDOWN</b>", ParagraphStyle('sh',fontSize=11,textColor=PRIMARY)))
    story.append(Spacer(1,0.2*cm))
    det_rows = [[
        Paragraph("<b>#</b>",styles['Normal']),
        Paragraph("<b>Filename</b>",styles['Normal']),
        Paragraph("<b>Potholes</b>",styles['Normal']),
        Paragraph("<b>Conf</b>",styles['Normal']),
        Paragraph("<b>Type</b>",styles['Normal']),
        Paragraph("<b>Time</b>",styles['Normal']),
    ]]
    for i,d in enumerate(detections_list,1):
        det_rows.append([
            str(i),
            str(d.get('filename','—'))[:30],
            str(d.get('count',0)),
            f"{d.get('confidence',0)*100:.1f}%",
            str(d.get('type','Image')),
            str(d.get('time',datetime.now().strftime('%H:%M:%S'))),
        ])
    dt2 = Table(det_rows, colWidths=[1*cm,5.5*cm,2*cm,2.5*cm,3*cm,3*cm])
    dt2.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0), LIGHT),
        ('TEXTCOLOR',(0,0),(-1,0), DARK),
        ('LINEBELOW',(0,0),(-1,0), 2, DARK),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[WHITE, HexColor('#F9FAFB')]),
        ('GRID',(0,0),(-1,-1),0.25, HexColor('#E5E7EB')),
        ('ALIGN',(0,0),(-1,-1),'CENTER'),
        ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('PADDING',(0,0),(-1,-1),6),
    ]))
    story += [dt2, Spacer(1,0.6*cm)]

    # Images
    img_items = [d for d in detections_list if d.get('img_path') and Path(str(d['img_path'])).exists()]
    if img_items:
        story.append(Paragraph("<b>EVIDENCE IMAGES</b>", ParagraphStyle('sh2',fontSize=11,textColor=PRIMARY)))
        story.append(Spacer(1,0.2*cm))
        for i in range(0, len(img_items), 2):
            row_cells = []
            for d in img_items[i:i+2]:
                try:
                    ri = RLImage(str(d['img_path']), width=7.5*cm, height=5*cm)
                    cap = Paragraph(f"<font size='8'>File: {d.get('filename','frame')} | Detected: {d.get('count',0)}</font>", ParagraphStyle('cap',alignment=1,fontSize=8))
                    cell_t = Table([[ri],[cap]], colWidths=[8*cm])
                    cell_t.setStyle(TableStyle([
                        ('ALIGN',(0,0),(-1,-1),'CENTER'),
                        ('BACKGROUND',(0,0),(-1,-1), WHITE),
                        ('BOX',(0,0),(-1,-1), 1, HexColor('#D1D5DB')),
                        ('PADDING',(0,0),(-1,-1),4),
                    ]))
                    row_cells.append(cell_t)
                except:
                    row_cells.append("")
            while len(row_cells) < 2: row_cells.append("")
            grid_row = Table([row_cells], colWidths=[8.5*cm,8.5*cm])
            grid_row.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP')]))
            story.append(grid_row)
            story.append(Spacer(1,0.2*cm))

    # Footer
    story += [Spacer(1,0.5*cm), HRFlowable(width="100%",thickness=1,color=DARK), Spacer(1,0.2*cm)]
    story.append(Paragraph(
        f"<b>CONFIDENTIAL</b> | Generated by Tamil Nadu Road Safety Node | {datetime.now().strftime('%d %b %Y')} | ID: {report_id[:8].upper()}",
        ParagraphStyle('footer',fontSize=8,textColor=DARK,alignment=1)
    ))
    doc.build(story)
    print(f"PDF generated: {pdf_path}")
    return str(pdf_path)'''

new_content = pattern.sub(new_code, content)
with open(r'c:\safety\app.py', 'w', encoding='utf-8') as f:
    f.write(new_content)
print('PDF Generation Updated Successfully!')
