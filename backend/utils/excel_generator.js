const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

function getColIndex(colLet) {
  let colIdx = 0;
  for (let i = 0; i < colLet.length; i++) {
    colIdx = colIdx * 26 + (colLet.charCodeAt(i) - 64);
  }
  return colIdx;
}

function findTemplatePath() {
  const scriptDir = __dirname;
  const repoDir = path.dirname(path.dirname(scriptDir));

  // Check specific file in root workspace
  const exactName = path.join(repoDir, 'Khoa DƯỢC-TBYT-CLS Chấm công tháng .....xlsx');
  if (fs.existsSync(exactName)) return exactName;

  // Search root directory for any template .xlsx
  try {
    const files = fs.readdirSync(repoDir);
    const found = files.find(f => 
      f.endsWith('.xlsx') && 
      !f.startsWith('~$') && 
      !f.toLowerCase().includes('test') &&
      !f.toLowerCase().includes('bao_cao') &&
      (f.toLowerCase().includes('khoa') || f.toLowerCase().includes('chấm công'))
    );
    if (found) return path.join(repoDir, found);
  } catch (e) {}

  // Fallback to backend folder
  try {
    const backendDir = path.dirname(scriptDir);
    const backendFiles = fs.readdirSync(backendDir);
    const backendFound = backendFiles.find(f => 
      f.endsWith('.xlsx') && 
      !f.startsWith('~$') && 
      !f.toLowerCase().includes('test') &&
      (f.toLowerCase().includes('khoa') || f.toLowerCase().includes('chấm công'))
    );
    if (backendFound) return path.join(backendDir, backendFound);
  } catch (e) {}

  return exactName;
}

function shiftMerges(ws, startFromRow, shiftAmount, deleteCount = 0) {
  if (shiftAmount === 0 || !ws._merges) return;
  const mergesToShift = [];
  const mergesToDelete = [];

  for (const [key, merge] of Object.entries(ws._merges)) {
    const model = merge.model || merge;
    if (shiftAmount < 0 && deleteCount > 0 && model.top >= startFromRow && model.bottom < startFromRow + deleteCount) {
      mergesToDelete.push(key);
    } else if (model.top >= (shiftAmount > 0 ? startFromRow : startFromRow + deleteCount)) {
      mergesToShift.push({
        top: model.top,
        left: model.left,
        bottom: model.bottom,
        right: model.right,
        key: key
      });
    }
  }

  for (const k of mergesToDelete) {
    delete ws._merges[k];
  }

  for (const m of mergesToShift) {
    delete ws._merges[m.key];
  }

  for (const m of mergesToShift) {
    const newTop = m.top + shiftAmount;
    const newBottom = m.bottom + shiftAmount;
    if (newTop > 0 && newBottom >= newTop) {
      ws.mergeCells(newTop, m.left, newBottom, m.right);
    }
  }
}

function adjustRows(ws, startRow, templateCount, targetCount) {
  const diff = targetCount - templateCount;
  if (diff === 0) return;

  if (diff > 0) {
    const insertAt = startRow + templateCount;
    ws.spliceRows(insertAt, 0, ...Array.from({ length: diff }, () => []));
    shiftMerges(ws, insertAt, diff);

    const srcRow = ws.getRow(insertAt - 1);
    for (let r = insertAt; r < insertAt + diff; r++) {
      const destRow = ws.getRow(r);
      destRow.height = srcRow.height;
      srcRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const destCell = destRow.getCell(colNumber);
        destCell.style = Object.assign({}, cell.style);
      });
    }
  } else if (diff < 0) {
    const deleteCount = -diff;
    const deleteAt = startRow + targetCount;

    const mergesToShift = [];
    const mergesToDelete = [];
    for (const [key, merge] of Object.entries(ws._merges || {})) {
      const model = merge.model || merge;
      if (model.top >= deleteAt && model.bottom < deleteAt + deleteCount) {
        mergesToDelete.push(key);
      } else if (model.top >= deleteAt + deleteCount) {
        mergesToShift.push({
          top: model.top,
          left: model.left,
          bottom: model.bottom,
          right: model.right,
          key: key
        });
      }
    }

    for (const k of mergesToDelete) delete ws._merges[k];
    for (const m of mergesToShift) delete ws._merges[m.key];

    ws.spliceRows(deleteAt, deleteCount);

    for (const m of mergesToShift) {
      const newTop = m.top + diff;
      const newBottom = m.bottom + diff;
      if (newTop > 0 && newBottom >= newTop) {
        try { ws.mergeCells(newTop, m.left, newBottom, m.right); } catch (e) {}
      }
    }
  }
}

function applyWeekendStyling(ws, startRow, totalRow, headerRow, month, year, hasSubheader = false) {
  const lastDay = new Date(year, month, 0).getDate();

  // Template weekend gray fill: RGB #BFBFBF (theme 0 tint -0.25 equivalent)
  const weekendFill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFBFBFBF' }
  };

  // Weekday pure white fill
  const weekdayFill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFFFFF' }
  };

  for (let d = 1; d <= 31; d++) {
    const col = 2 + d; // Day 1 = col 3 (C), Day 31 = col 33 (AG)
    const headerCell = ws.getRow(headerRow).getCell(col);

    if (d > lastDay) {
      // Days that do not exist in this month (e.g. day 31 in a 30-day month)
      headerCell.value = '';
      headerCell.style = Object.assign({}, headerCell.style, { fill: weekdayFill });

      if (hasSubheader) {
        const subCell = ws.getRow(headerRow + 1).getCell(col);
        subCell.value = '';
        subCell.style = Object.assign({}, subCell.style, { fill: weekdayFill });
      }

      for (let r = startRow; r < totalRow; r++) {
        const cell = ws.getRow(r).getCell(col);
        cell.value = '';
        cell.style = Object.assign({}, cell.style, { fill: weekdayFill });
      }
      continue;
    }

    const dateObj = new Date(year, month - 1, d);
    const dayOfWeek = dateObj.getDay(); // 0: Sunday, 6: Saturday
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    const currentFill = isWeekend ? weekendFill : weekdayFill;

    // Header cell is simple integer day number matching template
    headerCell.value = d;
    headerCell.alignment = { horizontal: 'center', vertical: 'middle' };
    headerCell.style = Object.assign({}, headerCell.style, { fill: currentFill });

    // Subheader row (Row 7 in Sheet 4: '1 Xuất mức 3')
    if (hasSubheader) {
      const subCell = ws.getRow(headerRow + 1).getCell(col);
      subCell.style = Object.assign({}, subCell.style, { fill: currentFill });
    }

    // Employee data rows
    for (let r = startRow; r < totalRow; r++) {
      const cell = ws.getRow(r).getCell(col);
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.style = Object.assign({}, cell.style, { fill: currentFill });
    }
  }
}

function updateDate(ws, sigLabelRow, monthStr, year, lastDay) {
  const dateRowObj = ws.getRow(sigLabelRow - 1);
  let isHoaKhanh = false;
  let firstDateCell = null;

  for (let c = 1; c <= ws.columnCount; c++) {
    const cell = dateRowObj.getCell(c);
    const v = String(cell.value || '').trim();
    const vLower = v.toLowerCase();
    if (vLower.includes('ngày') || vLower.includes('tháng') || vLower.includes('hải vân') || vLower.includes('hòa khánh')) {
      if (vLower.includes('hòa khánh')) isHoaKhanh = true;
      if (!firstDateCell) {
        firstDateCell = cell;
      } else {
        cell.value = ''; // clear duplicates across merged columns
      }
    }
  }

  if (firstDateCell) {
    const location = isHoaKhanh ? 'Hòa Khánh' : 'Hải Vân';
    firstDateCell.value = `${location}, ngày ${String(lastDay).padStart(2, '0')} tháng ${monthStr} năm ${year}`;
  }
}

function setDeptRichText(cell, deptName, fontSize = 12) {
  cell.value = {
    richText: [
      { text: "Bộ phận" },
      { font: { size: fontSize, name: 'Times New Roman', family: 1 }, text: `: ${deptName}` }
    ]
  };
}

function setCellFormulaResult(cell, formula, result) {
  cell.value = { formula };
  cell.model.result = (result != null) ? result : 0;
}

async function main() {
  if (process.argv.length < 4) {
    console.error("Error: Missing arguments. Usage: node excel_generator.js <json_path> <output_path>");
    process.exit(1);
  }

  const jsonPath = process.argv[2];
  const outputPath = process.argv[3];

  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const { month, year, department_name: deptName, reportData } = data;
    const employeesReport = reportData.data;
    const monthStr = String(month).padStart(2, '0');
    
    const templatePath = findTemplatePath();

    if (!fs.existsSync(templatePath)) {
      console.error(`Error: Template not found at ${templatePath}`);
      process.exit(1);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    
    const lastDay = new Date(year, month, 0).getDate();

    // =========================================================================
    // SHEET 1: Chấm công
    // =========================================================================
    if (workbook.getWorksheet('Chấm công')) {
      const ws = workbook.getWorksheet('Chấm công');
      
      // 1. Top right header (Mẫu C01-HD, Ban hành..., ngày 10/10...)
      try { ws.mergeCells('Y1:AM1'); } catch (e) {}
      try { ws.mergeCells('Y2:AM2'); } catch (e) {}
      try { ws.mergeCells('Y3:AM3'); } catch (e) {}
      
      const cellY1 = ws.getCell('Y1');
      cellY1.value = 'Mẫu C01-HD';
      cellY1.font = { name: 'Times New Roman', size: 12, bold: true, italic: false };
      cellY1.alignment = { horizontal: 'center', vertical: 'middle' };

      const cellY2 = ws.getCell('Y2');
      cellY2.value = 'Ban hành theo Thông tư số 107/2017/TT-BTc';
      cellY2.font = { name: 'Times New Roman', size: 11, bold: false, italic: false };
      cellY2.alignment = { horizontal: 'center', vertical: 'middle' };

      const cellY3 = ws.getCell('Y3');
      cellY3.value = 'ngày 10/10/2017 của Bộ Tài Chính )';
      cellY3.font = { name: 'Times New Roman', size: 11, italic: true };
      cellY3.alignment = { horizontal: 'center', vertical: 'middle' };

      // 2. Title block
      try { ws.mergeCells('A4:AM4'); } catch (e) {}
      try { ws.mergeCells('A5:AM5'); } catch (e) {}

      const cellA4 = ws.getCell('A4');
      cellA4.value = 'BẢNG CHẤM CÔNG';
      cellA4.font = { name: 'Times New Roman', size: 16, bold: true };
      cellA4.alignment = { horizontal: 'center', vertical: 'middle' };

      const cellA5 = ws.getCell('A5');
      cellA5.value = `THÁNG ${monthStr} NĂM ${year}`;
      cellA5.font = { name: 'Times New Roman', size: 12, bold: true };
      cellA5.alignment = { horizontal: 'center', vertical: 'middle' };

      // Update Department details (keep exact richText format)
      setDeptRichText(ws.getRow(2).getCell(1), deptName, 12);

      const startRow = 8;
      const templateCount = 7;
      const targetCount = employeesReport.length;
      adjustRows(ws, startRow, templateCount, targetCount);

      let sumAH = 0, sumAI = 0, sumAJ = 0, sumAK = 0, sumAL = 0, sumAM = 0;

      employeesReport.forEach((empRep, i) => {
        const r = startRow + i;
        const emp = empRep.employee;
        const att = empRep.attendance;
        const sums = empRep.summaries;

        const rowObj = ws.getRow(r);
        rowObj.getCell(1).value = i + 1;
        rowObj.getCell(2).value = emp.full_name;

        for (let d = 1; d <= 31; d++) {
          const col = 2 + d;
          const dateStr = `${year}-${monthStr}-${String(d).padStart(2, '0')}`;
          rowObj.getCell(col).value = (d <= lastDay) ? (att[dateStr] || '') : '';
        }

        rowObj.getCell(34).value = sums.AH != null ? sums.AH : null;
        rowObj.getCell(35).value = sums.AI != null ? sums.AI : null;
        rowObj.getCell(36).value = sums.AJ != null ? sums.AJ : null;
        rowObj.getCell(37).value = sums.AK != null ? sums.AK : null;
        rowObj.getCell(38).value = sums.AL != null ? sums.AL : null;
        rowObj.getCell(39).value = sums.AN != null ? sums.AN : null;

        sumAH += (sums.AH || 0);
        sumAI += (sums.AI || 0);
        sumAJ += (sums.AJ || 0);
        sumAK += (sums.AK || 0);
        sumAL += (sums.AL || 0);
        sumAM += (sums.AN || 0);
      });

      const totalRow = startRow + targetCount;
      ws.getRow(totalRow).getCell(2).value = `Tổng cộng: ${targetCount}`;
      
      const colMap1 = [
        { col: 'AH', val: sumAH },
        { col: 'AI', val: sumAI },
        { col: 'AJ', val: sumAJ },
        { col: 'AK', val: sumAK },
        { col: 'AL', val: sumAL },
        { col: 'AM', val: sumAM }
      ];
      colMap1.forEach(item => {
        const colIdx = getColIndex(item.col);
        const cell = ws.getRow(totalRow).getCell(colIdx);
        setCellFormulaResult(cell, `SUM(${item.col}${startRow}:${item.col}${totalRow - 1})`, item.val);
      });

      // Apply dynamic weekend styling for Sheet 1
      applyWeekendStyling(ws, startRow, totalRow, 7, month, year, false);

      // Update date in signature block
      let sigLabelRow = null;
      const maxRow = ws.rowCount;
      for (let r = totalRow + 1; r <= maxRow; r++) {
        for (let c = 1; c <= 10; c++) {
          const val = ws.getRow(r).getCell(c).value;
          if (val && (String(val).includes('Người chấm') || String(val).includes('Người lập'))) {
            sigLabelRow = r;
            break;
          }
        }
        if (sigLabelRow) break;
      }
      if (sigLabelRow) {
        const dateRow = sigLabelRow - 1;
        try { ws.mergeCells(dateRow, 27, dateRow, 39); } catch (e) {}
        const dateCell = ws.getRow(dateRow).getCell(27);
        dateCell.value = `Hải Vân, ngày ${String(lastDay).padStart(2, '0')} tháng ${monthStr} năm ${year}`;
        dateCell.font = { name: 'Times New Roman', size: 12, italic: true };
        dateCell.alignment = { horizontal: 'center', vertical: 'middle' };

        try { ws.mergeCells(sigLabelRow, 27, sigLabelRow, 39); } catch (e) {}
        const leaderCell = ws.getRow(sigLabelRow).getCell(27);
        leaderCell.value = 'Thủ trưởng đơn vị';
        leaderCell.font = { name: 'Times New Roman', size: 12, bold: true };
        leaderCell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    }

    // =========================================================================
    // SHEET 2: Chấm công trực
    // =========================================================================
    if (workbook.getWorksheet('Chấm công trực')) {
      const ws = workbook.getWorksheet('Chấm công trực');
      setDeptRichText(ws.getRow(2).getCell(1), deptName, 11);
      ws.getRow(2).getCell(9).value = `Tháng ${monthStr} Năm ${year}`;

      const dutyEmployees = employeesReport.filter(e => e.duty && e.duty.has_duty);
      const startRow = 7;
      const templateCount = 5;
      const targetCount = dutyEmployees.length;
      const effectiveCount = Math.max(1, targetCount);
      adjustRows(ws, startRow, templateCount, effectiveCount);

      let sumDutyWeekday = 0;
      let sumDutyWeekend = 0;
      let sumDutyHoliday = 0;
      let sumDutyTotal = 0;

      if (targetCount > 0) {
        dutyEmployees.forEach((empRep, i) => {
          const r = startRow + i;
          const emp = empRep.employee;
          const att = empRep.attendance;
          const duty = empRep.duty;

          const rowObj = ws.getRow(r);
          rowObj.getCell(1).value = i + 1;
          rowObj.getCell(2).value = emp.full_name;

          for (let d = 1; d <= 31; d++) {
            const col = 2 + d;
            const dateStr = `${year}-${monthStr}-${String(d).padStart(2, '0')}`;
            const symbol = att[dateStr] || '';
            if (d <= lastDay && ['T', 'Td', 'TD', 'cd', 'CD', 'TTc', 'TTC'].includes(symbol)) {
              rowObj.getCell(col).value = symbol;
            } else {
              rowObj.getCell(col).value = '';
            }
          }

          const wkd = (duty && duty.weekday != null) ? duty.weekday : null;
          const wke = (duty && duty.weekend != null) ? duty.weekend : null;
          const hol = (duty && duty.holiday != null) ? duty.holiday : null;
          const empDutyTotal = ((duty && duty.weekday) || 0) + ((duty && duty.weekend) || 0) + ((duty && duty.holiday) || 0);

          rowObj.getCell(34).value = wkd;
          rowObj.getCell(35).value = wke;
          rowObj.getCell(36).value = hol;
          setCellFormulaResult(rowObj.getCell(37), `SUM(AH${r}:AJ${r})`, empDutyTotal);

          sumDutyWeekday += ((duty && duty.weekday) || 0);
          sumDutyWeekend += ((duty && duty.weekend) || 0);
          sumDutyHoliday += ((duty && duty.holiday) || 0);
          sumDutyTotal += empDutyTotal;
        });
      } else {
        const rowObj = ws.getRow(startRow);
        rowObj.getCell(1).value = '';
        rowObj.getCell(2).value = '';
        for (let c = 3; c <= 37; c++) rowObj.getCell(c).value = '';
      }

      const totalRow = startRow + effectiveCount;
      ws.getRow(totalRow).getCell(2).value = `Tổng cộng: ${targetCount}`;
      
      const colMap2 = [
        { col: 'AH', val: sumDutyWeekday },
        { col: 'AI', val: sumDutyWeekend },
        { col: 'AJ', val: sumDutyHoliday },
        { col: 'AK', val: sumDutyTotal }
      ];
      colMap2.forEach(item => {
        const colIdx = getColIndex(item.col);
        const cell = ws.getRow(totalRow).getCell(colIdx);
        setCellFormulaResult(cell, `SUM(${item.col}${startRow}:${item.col}${totalRow - 1})`, item.val);
      });

      // Apply dynamic weekend styling for Sheet 2
      applyWeekendStyling(ws, startRow, totalRow, 6, month, year, false);

      // Update date in signature block
      let sigLabelRow = null;
      const maxRow = ws.rowCount;
      for (let r = totalRow + 1; r <= maxRow; r++) {
        for (let c = 1; c <= 5; c++) {
          const val = ws.getRow(r).getCell(c).value;
          if (val && (String(val).includes('Người chấm') || String(val).includes('Người lập'))) {
            sigLabelRow = r;
            break;
          }
        }
        if (sigLabelRow) break;
      }
      if (sigLabelRow) {
        updateDate(ws, sigLabelRow, monthStr, year, lastDay);
      }
    }

    // =========================================================================
    // SHEET 3: Độc hại theo lương
    // =========================================================================
    if (workbook.getWorksheet('Độc hại theo lương')) {
      const ws = workbook.getWorksheet('Độc hại theo lương');
      setDeptRichText(ws.getRow(2).getCell(1), deptName, 12);
      ws.getRow(2).getCell(7).value = `Tháng ${monthStr} năm ${year}`;

      const toxicSalaryEmployees = employeesReport.filter(e => e.employee.has_toxic_salary);
      const startRow = 7;
      const templateCount = 1;
      const targetCount = toxicSalaryEmployees.length;
      const effectiveCount = Math.max(1, targetCount);
      adjustRows(ws, startRow, templateCount, effectiveCount);

      let sumToxicSalary = 0;
      if (targetCount > 0) {
        toxicSalaryEmployees.forEach((empRep, i) => {
          const r = startRow + i;
          const emp = empRep.employee;
          const att = empRep.attendance;
          const toxic = empRep.toxic;

          const rowObj = ws.getRow(r);
          rowObj.getCell(1).value = i + 1;
          rowObj.getCell(2).value = emp.full_name;

          for (let d = 1; d <= 31; d++) {
            const col = 2 + d;
            const dateStr = `${year}-${monthStr}-${String(d).padStart(2, '0')}`;
            const symbol = att[dateStr] || '';
            if (d <= lastDay && ['+', '-', 'T', 'Tc', 'TTc', 'Td', 'cd', 'BL'].includes(symbol)) {
              rowObj.getCell(col).value = symbol;
            } else {
              rowObj.getCell(col).value = '';
            }
          }

          rowObj.getCell(34).value = toxic.salary;
          sumToxicSalary += ((toxic && toxic.salary) || 0);
        });
      } else {
        const rowObj = ws.getRow(startRow);
        rowObj.getCell(1).value = '';
        rowObj.getCell(2).value = '';
        for (let c = 3; c <= 34; c++) rowObj.getCell(c).value = '';
      }

      const totalRow = startRow + effectiveCount;
      ws.getRow(totalRow).getCell(2).value = "Tổng cộng:";
      
      const cell = ws.getRow(totalRow).getCell(34);
      const isCellMerged = cell.type === ExcelJS.ValueType.Merge || cell.isMerged;
      if (!isCellMerged) {
        setCellFormulaResult(cell, `SUM(AH${startRow}:AH${totalRow - 1})`, sumToxicSalary);
      }

      // Apply dynamic weekend styling for Sheet 3
      applyWeekendStyling(ws, startRow, totalRow, 6, month, year, false);

      // Update date in signature block
      let sigLabelRow = null;
      const maxRow = ws.rowCount;
      for (let r = totalRow + 1; r <= maxRow; r++) {
        for (let c = 1; c <= 5; c++) {
          const val = ws.getRow(r).getCell(c).value;
          if (val && (String(val).includes('Người chấm') || String(val).includes('Người lập'))) {
            sigLabelRow = r;
            break;
          }
        }
        if (sigLabelRow) break;
      }
      if (sigLabelRow) {
        updateDate(ws, sigLabelRow, monthStr, year, lastDay);
      }
    }

    // =========================================================================
    // SHEET 4: Độc hại hiện vật
    // =========================================================================
    if (workbook.getWorksheet('Độc hại hiện vật')) {
      const ws = workbook.getWorksheet('Độc hại hiện vật');
      setDeptRichText(ws.getRow(2).getCell(1), deptName, 12);
      ws.getRow(2).getCell(7).value = `Tháng ${monthStr} năm ${year}`;

      const toxicInKindEmployees = employeesReport.filter(e => e.employee.has_toxic_in_kind);
      const startRow = 8;
      const templateCount = 1;
      const targetCount = toxicInKindEmployees.length;
      const effectiveCount = Math.max(1, targetCount);
      adjustRows(ws, startRow, templateCount, effectiveCount);

      let sumToxicInKind = 0;
      if (targetCount > 0) {
        toxicInKindEmployees.forEach((empRep, i) => {
          const r = startRow + i;
          const emp = empRep.employee;
          const att = empRep.attendance;
          const toxic = empRep.toxic;

          const rowObj = ws.getRow(r);
          rowObj.getCell(1).value = i + 1;
          rowObj.getCell(2).value = emp.full_name;

          for (let d = 1; d <= 31; d++) {
            const col = 2 + d;
            const dateStr = `${year}-${monthStr}-${String(d).padStart(2, '0')}`;
            const symbol = att[dateStr] || '';
            
            const dateObj = new Date(year, month - 1, d);
            const isWkday = dateObj.getDay() > 0 && dateObj.getDay() < 6;
            const isHol = (reportData.holidays || []).includes(dateStr) || (data.holidays || []).includes(dateStr);

            if (d <= lastDay && ((isWkday && !isHol) || symbol === 'BL') && ['+', '-', 'T', 'Tc', 'TTc', 'Td', 'cd', 'BL'].includes(symbol)) {
              rowObj.getCell(col).value = symbol;
            } else {
              rowObj.getCell(col).value = '';
            }
          }

          rowObj.getCell(34).value = toxic.in_kind;
          sumToxicInKind += ((toxic && toxic.in_kind) || 0);
        });
      } else {
        const rowObj = ws.getRow(startRow);
        rowObj.getCell(1).value = '';
        rowObj.getCell(2).value = '';
        for (let c = 3; c <= 34; c++) rowObj.getCell(c).value = '';
      }

      const totalRow = startRow + effectiveCount;
      ws.getRow(totalRow).getCell(2).value = "Tổng cộng:";
      
      const cell = ws.getRow(totalRow).getCell(34);
      const isCellMerged = cell.type === ExcelJS.ValueType.Merge || cell.isMerged;
      if (!isCellMerged) {
        setCellFormulaResult(cell, `SUM(AH${startRow}:AH${totalRow - 1})`, sumToxicInKind);
      }

      // Apply dynamic weekend styling for Sheet 4 (hasSubheader = true for row 7 '1 Xuất mức 3')
      applyWeekendStyling(ws, startRow, totalRow, 6, month, year, true);

      // Update date in signature block
      let sigLabelRow = null;
      const maxRow = ws.rowCount;
      for (let r = totalRow + 1; r <= maxRow; r++) {
        for (let c = 1; c <= 5; c++) {
          const val = ws.getRow(r).getCell(c).value;
          if (val && (String(val).includes('Người chấm') || String(val).includes('Người lập'))) {
            sigLabelRow = r;
            break;
          }
        }
        if (sigLabelRow) break;
      }
      if (sigLabelRow) {
        updateDate(ws, sigLabelRow, monthStr, year, lastDay);
      }
    }

    await workbook.xlsx.writeFile(outputPath);
    console.log(`Excel generated successfully at ${outputPath}`);
    process.exit(0);

  } catch (err) {
    console.error("Error generating excel:", err);
    process.exit(1);
  }
}

main();
