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

function copyCellStyle(srcCell, destCell) {
  destCell.style = srcCell.style;
}

function adjustRows(ws, startRow, templateCount, targetCount) {
  const diff = targetCount - templateCount;
  if (diff > 0) {
    // Insert empty rows
    ws.spliceRows(startRow + templateCount, 0, ...Array.from({ length: diff }, () => []));
    
    // Copy styles from the last template row (which is now shifted to startRow + templateCount + diff - 1)
    const srcRow = ws.getRow(startRow + templateCount - 1);
    for (let r = startRow + templateCount; r < startRow + targetCount; r++) {
      const destRow = ws.getRow(r);
      destRow.height = srcRow.height;
      srcRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const destCell = destRow.getCell(colNumber);
        destCell.style = cell.style;
      });
    }
  } else if (diff < 0) {
    // Delete rows
    ws.spliceRows(startRow + targetCount, -diff);
  }
}

function applyWeekendStyling(ws, startRow, endRow, headerRow, month, year) {
  const lastDay = new Date(year, month, 0).getDate();
  const monthStr = String(month).padStart(2, '0');

  for (let d = 1; d <= 31; d++) {
    const col = 2 + d;
    
    // Clear values and formatting for non-existent days in shorter months (e.g. day 31 in a 30-day month)
    if (d > lastDay) {
      for (let r = headerRow; r <= endRow; r++) {
        const cell = ws.getRow(r).getCell(col);
        cell.value = '';
        cell.fill = { type: 'pattern', pattern: 'none' };
        cell.border = {};
      }
      continue;
    }

    const dateObj = new Date(year, month - 1, d);
    const dayOfWeek = dateObj.getDay();
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6); // 0 is Sunday, 6 is Saturday

    // Format header label (e.g., "1\nT7", "2\nCN")
    const weekdayLabels = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const weekdayLabel = weekdayLabels[dayOfWeek];
    
    const headerCell = ws.getRow(headerRow).getCell(col);
    headerCell.value = `${d}\n${weekdayLabel}`;
    headerCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    // Apply formatting to cells in this column
    for (let r = headerRow; r <= endRow; r++) {
      const cell = ws.getRow(r).getCell(col);
      
      if (isWeekend) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { theme: 0, tint: -0.249977111117893 },
          bgColor: { indexed: 64 }
        };
        // For employee data cells (not header and not total row)
        if (r >= startRow && r < endRow) {
          cell.font = { name: 'Times New Roman', size: 10, bold: true };
        }
      } else {
        cell.fill = {
          type: 'pattern',
          pattern: 'none'
        };
        if (r >= startRow && r < endRow) {
          cell.font = { name: 'Times New Roman', size: 10, bold: false };
        }
      }
    }
  }
}

function updateSignatures(ws, labelRow, writerName, managerName, directorName) {
  // Insert 4 rows below the signature labels to write names
  ws.spliceRows(labelRow + 1, 0, ...Array.from({ length: 4 }, () => []));
  const nameRow = labelRow + 4;
  
  const labelRowObj = ws.getRow(labelRow);
  const nameRowObj = ws.getRow(nameRow);
  
  labelRowObj.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    // Only process master cells to prevent duplicate names in merged columns
    if (cell.master && cell.master !== cell) {
      return;
    }
    const val = cell.value;
    if (val) {
      const valStr = String(val).trim().toLowerCase();
      if (valStr.includes('người chấm') || valStr.includes('người lập')) {
        const destCell = nameRowObj.getCell(colNumber);
        destCell.value = writerName;
        destCell.font = { name: 'Times New Roman', size: 11, bold: true };
        destCell.alignment = { horizontal: 'center' };
      } else if (valStr.includes('phụ trách')) {
        const destCell = nameRowObj.getCell(colNumber);
        destCell.value = managerName;
        destCell.font = { name: 'Times New Roman', size: 11, bold: true };
        destCell.alignment = { horizontal: 'center' };
      } else if (valStr.includes('thủ trưởng') || valStr.includes('trưởng khoa') || valStr.includes('trưởng trạm')) {
        // Change title label itself to "Trưởng khoa"
        cell.value = "Trưởng khoa";
        
        const destCell = nameRowObj.getCell(colNumber);
        destCell.value = directorName;
        destCell.font = { name: 'Times New Roman', size: 11, bold: true };
        nameRowObj.rowHeight = 20;
        destCell.alignment = { horizontal: 'center' };
      }
    }
  });
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
    const { month, year, department_name: deptName, writer_name: writerName, manager_name: managerName, director_name: directorName, reportData } = data;
    const employeesReport = reportData.data;
    const monthStr = String(month).padStart(2, '0');
    
    // Resolve template path
    const scriptDir = __dirname;
    const repoDir = path.dirname(path.dirname(scriptDir));
    const templatePath = path.join(repoDir, "Chấm công tháng 7.2026.xlsx");

    if (!fs.existsSync(templatePath)) {
      console.error(`Error: Template not found at ${templatePath}`);
      process.exit(1);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    
    const lastDay = new Date(year, month, 0).getDate();
    const dateSigStr = `Hải Vân, ngày ${String(lastDay).padStart(2, '0')} tháng ${monthStr} năm ${year}`;

    // =========================================================================
    // SHEET 1: Chấm công
    // =========================================================================
    if (workbook.getWorksheet('Chấm công')) {
      const ws = workbook.getWorksheet('Chấm công');
      
      // Update Title details
      ws.getRow(2).getCell(1).value = `Bộ phận: ${deptName}`;
      ws.getRow(5).getCell(1).value = `THÁNG ${monthStr} NĂM ${year}`;

      const startRow = 8;
      const templateCount = 7;
      const targetCount = employeesReport.length;
      adjustRows(ws, startRow, templateCount, targetCount);

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
          rowObj.getCell(col).value = att[dateStr] || '';
        }

        rowObj.getCell(34).value = sums.AH;
        rowObj.getCell(35).value = sums.AI;
        rowObj.getCell(36).value = sums.AJ;
        rowObj.getCell(37).value = sums.AK;
        rowObj.getCell(38).value = sums.AL;
        rowObj.getCell(39).value = sums.AM;
      });

      const totalRow = startRow + targetCount;
      ws.getRow(totalRow).getCell(2).value = `Tổng cộng: ${targetCount}`;
      
      const colLetters = ['AH', 'AI', 'AJ', 'AK', 'AL', 'AM'];
      colLetters.forEach(colLet => {
        const colIdx = getColIndex(colLet);
        ws.getRow(totalRow).getCell(colIdx).value = { formula: `SUM(${colLet}${startRow}:${colLet}${totalRow - 1})` };
      });

      // Apply dynamic weekend styling for Sheet 1
      applyWeekendStyling(ws, startRow, totalRow, 7, month, year);

      let sigLabelRow = null;
      const maxRow = ws.rowCount;
      for (let r = totalRow + 1; r <= maxRow; r++) {
        const val = ws.getRow(r).getCell(1).value;
        if (val && String(val).includes('Người chấm công')) {
          sigLabelRow = r;
          break;
        }
      }
      if (sigLabelRow) {
        ws.getRow(sigLabelRow - 1).getCell(27).value = dateSigStr;
        updateSignatures(ws, sigLabelRow, writerName, managerName, directorName);
      }
    }

    // =========================================================================
    // SHEET 2: Chấm công trực
    // =========================================================================
    if (workbook.getWorksheet('Chấm công trực')) {
      const ws = workbook.getWorksheet('Chấm công trực');
      ws.getRow(2).getCell(1).value = `Bộ phận: ${deptName}`;
      ws.getRow(2).getCell(9).value = `Tháng ${monthStr} Năm ${year}`;

      const dutyEmployees = employeesReport.filter(e => e.duty.has_duty);
      const startRow = 7;
      const templateCount = 5;
      const targetCount = dutyEmployees.length;
      adjustRows(ws, startRow, templateCount, targetCount);

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
            if (symbol === 'T') {
              rowObj.getCell(col).value = 'T';
            } else if (['Td', 'TD'].includes(symbol)) {
              rowObj.getCell(col).value = 'TD';
            } else if (['cd', 'CD'].includes(symbol)) {
              rowObj.getCell(col).value = 'cd';
            } else if (['TTc', 'TTC'].includes(symbol)) {
              rowObj.getCell(col).value = 'TTc';
            } else {
              rowObj.getCell(col).value = '';
            }
          }

          rowObj.getCell(34).value = duty.weekday;
          rowObj.getCell(35).value = duty.weekend;
          rowObj.getCell(36).value = duty.holiday;
          rowObj.getCell(37).value = { formula: `SUM(AH${r}:AJ${r})` };
        });
      }

      const totalRow = startRow + Math.max(1, targetCount);
      ws.getRow(totalRow).getCell(2).value = `Tổng cộng: ${targetCount}`;
      
      const colLetters = ['AH', 'AI', 'AJ', 'AK'];
      colLetters.forEach(colLet => {
        const colIdx = getColIndex(colLet);
        ws.getRow(totalRow).getCell(colIdx).value = { formula: `SUM(${colLet}${startRow}:${colLet}${totalRow - 1})` };
      });

      // Apply dynamic weekend styling for Sheet 2
      applyWeekendStyling(ws, startRow, totalRow, 6, month, year);

      let sigLabelRow = null;
      const maxRow = ws.rowCount;
      for (let r = totalRow + 1; r <= maxRow; r++) {
        const val = ws.getRow(r).getCell(2).value;
        if (val && String(val).includes('Người chấm')) {
          sigLabelRow = r;
          break;
        }
      }
      if (sigLabelRow) {
        ws.getRow(sigLabelRow - 1).getCell(29).value = dateSigStr;
        updateSignatures(ws, sigLabelRow, writerName, managerName, directorName);
      }
    }

    // =========================================================================
    // SHEET 3: Độc hại theo lương
    // =========================================================================
    if (workbook.getWorksheet('Độc hại theo lương')) {
      const ws = workbook.getWorksheet('Độc hại theo lương');
      ws.getRow(2).getCell(1).value = `Bộ phận: ${deptName}`;
      ws.getRow(2).getCell(7).value = `Tháng ${monthStr} năm ${year}`;

      const toxicSalaryEmployees = employeesReport.filter(e => e.employee.has_toxic_salary);
      const startRow = 7;
      const templateCount = 1;
      const targetCount = toxicSalaryEmployees.length;
      adjustRows(ws, startRow, templateCount, targetCount);

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
          if (['+', '-', 'T', 'Tc', 'TTc', 'Td', 'cd'].includes(symbol)) {
            rowObj.getCell(col).value = symbol;
          } else {
            rowObj.getCell(col).value = '';
          }
        }

        rowObj.getCell(34).value = toxic.salary;
      });

      const totalRow = startRow + Math.max(1, targetCount);
      ws.getRow(totalRow).getCell(2).value = "Tổng cộng:";
      
      const cell = ws.getRow(totalRow).getCell(34);
      const isCellMerged = cell.type === ExcelJS.ValueType.Merge || cell.isMerged;
      if (!isCellMerged) {
        cell.value = { formula: `SUM(AH${startRow}:AH${totalRow - 1})` };
      }

      // Apply dynamic weekend styling for Sheet 3
      applyWeekendStyling(ws, startRow, totalRow, 6, month, year);

      let sigLabelRow = null;
      const maxRow = ws.rowCount;
      for (let r = totalRow + 1; r <= maxRow; r++) {
        const val = ws.getRow(r).getCell(2).value;
        if (val && String(val).includes('Người chấm')) {
          sigLabelRow = r;
          break;
        }
      }
      if (sigLabelRow) {
        ws.getRow(sigLabelRow - 1).getCell(25).value = dateSigStr;
        updateSignatures(ws, sigLabelRow, writerName, managerName, directorName);
      }
    }

    // =========================================================================
    // SHEET 4: Độc hại hiện vật
    // =========================================================================
    if (workbook.getWorksheet('Độc hại hiện vật')) {
      const ws = workbook.getWorksheet('Độc hại hiện vật');
      ws.getRow(2).getCell(1).value = `Bộ phận: ${deptName}`;
      ws.getRow(2).getCell(7).value = `Tháng ${monthStr} năm ${year}`;

      const toxicInKindEmployees = employeesReport.filter(e => e.employee.has_toxic_in_kind);
      const startRow = 8;
      const templateCount = 1;
      const targetCount = toxicInKindEmployees.length;
      adjustRows(ws, startRow, templateCount, targetCount);

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
          const isWkday = dateObj.getDay() > 0 && dateObj.getDay() < 6; // Mon-Fri
          const isHol = (reportData.holidays || []).includes(dateStr) || (data.holidays || []).includes(dateStr);

          if (isWkday && !isHol && ['+', '-', 'T', 'Tc', 'TTc', 'Td', 'cd'].includes(symbol)) {
            rowObj.getCell(col).value = symbol;
          } else {
            rowObj.getCell(col).value = '';
          }
        }

        rowObj.getCell(34).value = toxic.in_kind;
      });

      const totalRow = startRow + Math.max(1, targetCount);
      ws.getRow(totalRow).getCell(2).value = "Tổng cộng:";
      
      const cell = ws.getRow(totalRow).getCell(34);
      const isCellMerged = cell.type === ExcelJS.ValueType.Merge || cell.isMerged;
      if (!isCellMerged) {
        cell.value = { formula: `SUM(AH${startRow}:AH${totalRow - 1})` };
      }

      // Apply dynamic weekend styling for Sheet 4
      applyWeekendStyling(ws, startRow, totalRow, 7, month, year);

      let sigLabelRow = null;
      const maxRow = ws.rowCount;
      for (let r = totalRow + 1; r <= maxRow; r++) {
        const val = ws.getRow(r).getCell(2).value;
        if (val && String(val).includes('Người chấm')) {
          sigLabelRow = r;
          break;
        }
      }
      if (sigLabelRow) {
        ws.getRow(sigLabelRow - 1).getCell(25).value = dateSigStr;
        updateSignatures(ws, sigLabelRow, writerName, managerName, directorName);
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
