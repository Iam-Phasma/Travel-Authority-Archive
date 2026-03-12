/**
 * Travel Authority PDF Generator
 * Generates TA forms based on user input
 */

const generateTAPDF = (formData) => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Constants
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    const contentWidth = pageWidth - (2 * margin);
    
    // Column positions for section 2
    const officeCol = margin + 2;
    const nameTitleX = margin + 2;
    const approvedByName = 'DR. ROGELIO T. GALERA JR., CESO III';
    
    // Master right-column divider X — all right-side vertical lines align here
    // Shifted further right (per requested alignment), while preserving Approved-by single-line fit
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const approvedByNameWidth = doc.getTextWidth(approvedByName);
    const minApprovedByColWidth = approvedByNameWidth + 4;
    const defaultRightDivX = margin + 116;
    let rightDivX = defaultRightDivX;
    const maxRightDivXForApprovedBy = pageWidth - margin - minApprovedByColWidth;
    if (rightDivX > maxRightDivXForApprovedBy) {
        rightDivX = maxRightDivXForApprovedBy;
    }

    const periodCol = rightDivX + 2;

    // Align Office/Destination divider with Transportation|Travel Allowance divider
    const officeDestinationDivX = margin + ((rightDivX - margin) / 2);
    const destinationCol = officeDestinationDivX + 2;

    // Shared right-side alignment anchor for TA number and checkbox columns
    const rightPanelAlignX = rightDivX + 14;

    // Generate TA Number (Year-Month-)
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const taNumber = `${year}-${month}-`;

    // Format date requested
    const dateRequested = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // Header
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('COMMISSION ON HIGHER EDUCATION', pageWidth / 2, 20, { align: 'center' });
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Regional Office IV', pageWidth / 2, 25, { align: 'center' });
    doc.text('J.P. Laurel Highway, City Hall Compound, Brgy. Marawoy, Lipa City, Batangas', pageWidth / 2, 30, { align: 'center' });

    // TA Number (left-aligned for handwritten completion)
    doc.setFontSize(9);
    doc.text(`No. ${taNumber}`, rightPanelAlignX, 40);

    // Title
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('AUTHORITY TO TRAVEL', pageWidth / 2, 50, { align: 'center' });

    let yPos = 60;
    const borderTop = 10;

    // Section 1: Name of Officials/Employees and Position
    doc.setLineWidth(0.3);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    
    const section1Top = yPos;
    yPos += 5;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Name of Officials/Employees:', nameTitleX, yPos);
    doc.text('Position:', rightDivX + 5, yPos);
    
    yPos += 5;
    doc.setFont('helvetica', 'normal');
    
    // Display officials and positions
    formData.officials.forEach((official, index) => {
        const officialName = String(official.name || '').trim();
        doc.text(officialName, nameTitleX, yPos);
        if (official.position) {
            doc.text(official.position, rightDivX + 5, yPos);
        }
        yPos += 4;
    });

    yPos = Math.max(yPos, 85); // Ensure minimum height

    // Section 2: Office/Station, Destination, Period of Travel
    doc.line(margin, yPos, pageWidth - margin, yPos);
    const section2Top = yPos;
    yPos += 5;
    
    doc.setFont('helvetica', 'bold');
    doc.text('Office/Station', officeCol, yPos);
    doc.text('Destination:', destinationCol, yPos);
    doc.text('Period of Travel:', periodCol, yPos);

    yPos += 5;
    doc.setFont('helvetica', 'normal');
    doc.text('CHED IV, Lipa City, Batangas', officeCol, yPos);
    doc.text(formData.destination, destinationCol, yPos);
    
    // Format period of travel
    let periodText = formData.travelDateFormatted;
    if (formData.travelEnd) {
        periodText += ` - ${formData.travelEndFormatted}`;
    }
    doc.text(periodText, periodCol, yPos);

    yPos += 5;

    // Section 3: Purpose of Travel
    doc.line(margin, yPos, pageWidth - margin, yPos);
    const section3Top = yPos;
    yPos += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('Purpose of Travel', margin + 2, yPos);

    yPos += 5;
    doc.setFont('helvetica', 'normal');
    const purposeLines = doc.splitTextToSize(formData.purpose, rightDivX - margin - 4);
    doc.text(purposeLines, margin + 2, yPos);
    
    // Checkboxes on the right
    const checkboxX = rightPanelAlignX;
    doc.rect(checkboxX, yPos - 3, 3, 3);
    doc.text('Official Business', checkboxX + 5, yPos);
    
    doc.rect(checkboxX, yPos + 6, 3, 3);
    doc.text('Official Time Only', checkboxX + 5, yPos + 9);

    yPos += Math.max(purposeLines.length * 5, 18);

    // Vertical separator in Purpose section aligned to rightDivX
    doc.line(rightDivX, section3Top, rightDivX, yPos);

    // Section 4: Financial Table
    doc.line(margin, yPos, pageWidth - margin, yPos);
    const tableTop = yPos;
    yPos += 5;

    // Table: 4 columns on the left with row grid, dedicated "Please check" column on the right
    const tableHeaders = ['Honorarium', 'Transportation', 'Travel Allowance', 'Total Amount'];
    const checkColX = rightPanelAlignX;
    const leftFourColWidth = (rightDivX - margin) / 4;
    const dashRowCount = 5;
    const dashRowStep = 4;

    const tableHeaderY = yPos;
    const firstDashRowY = tableHeaderY + 4;

    doc.setFont('helvetica', 'bold');
    for (let i = 0; i < 4; i++) {
        doc.text(tableHeaders[i], margin + (leftFourColWidth * i) + 2, tableHeaderY);
    }

    // Header separator line for the 4-column financial sub-table
    doc.line(margin, tableHeaderY + 2, rightDivX, tableHeaderY + 2);

    doc.setFont('helvetica', 'normal');
    for (let rowIndex = 0; rowIndex < dashRowCount; rowIndex++) {
        const rowY = firstDashRowY + (rowIndex * dashRowStep);

        // Row separator lines so each row is its own cell
        doc.line(margin, rowY + 2, rightDivX, rowY + 2);
    }

    // Right-side checklist aligned horizontally with the first row of the left sub-table
    const pleaseCheckY = firstDashRowY;
    const cashAdvanceY = pleaseCheckY + 6;
    const reimbursementY = cashAdvanceY + 6;

    doc.text('Please check:', checkColX, pleaseCheckY);
    doc.rect(checkColX, cashAdvanceY - 3, 3, 3);
    doc.text('Cash Advance', checkColX + 5, cashAdvanceY);
    doc.rect(checkColX, reimbursementY - 3, 3, 3);
    doc.text('Reimbursement', checkColX + 5, reimbursementY);

    const leftTableBottom = firstDashRowY + ((dashRowCount - 1) * dashRowStep) + 2;
    const rightTableBottom = reimbursementY + 3;
    const tableBottom = Math.max(leftTableBottom, rightTableBottom);
    yPos = tableBottom;

    // Section 5: Approval Section
    doc.line(margin, yPos, pageWidth - margin, yPos);
    const approvalTop = yPos;
    yPos += 5;

    // Left col width for 2-column sub-sections; right column uses rightDivX
    const leftColWidth = (rightDivX - margin) / 2;
    const midDivX = margin + leftColWidth;
    
    doc.setFont('helvetica', 'bold');
    doc.text('Recommending Approval:', margin + 2, yPos);
    doc.text('Funds Available:', midDivX + 2, yPos);
    doc.text('Approved by:', rightDivX + 2, yPos);

    const approvalNameTopGap = 14;
    const approvalBottomGap = 6;

    yPos += approvalNameTopGap;
    doc.setFont('helvetica', 'bold');
    doc.text('DR. FREDDIE B. BULAUAN', margin + 2, yPos);
    doc.text('DANICA A. DE SILVA', midDivX + 2, yPos);
    doc.text(approvedByName, rightDivX + 2, yPos);
    
    yPos += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('Chief Administrative Officer', margin + 2, yPos);
    doc.text('Accountant III', midDivX + 2, yPos);
    doc.text('Director IV', rightDivX + 2, yPos);

    yPos += approvalBottomGap;

    // Draw approval section vertical dividers
    doc.line(midDivX, approvalTop, midDivX, yPos);
    doc.line(rightDivX, approvalTop, rightDivX, yPos);

    // Section 6: Footer Information
    doc.line(margin, yPos, pageWidth - margin, yPos);
    const footerTop = yPos;
    yPos += 5;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Date Requested:', margin + 2, yPos);
    doc.text('Source of Funds:', midDivX + 2, yPos);
    doc.text('Date Approved:', rightDivX + 2, yPos);

    yPos += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(dateRequested, margin + 2, yPos);
    
    doc.text('(   ) MOOE - 101', midDivX + 2, yPos);
    yPos += 4;
    doc.text('(   ) HEDF - 151', midDivX + 2, yPos);
    yPos += 4;
    doc.text('(   ) UAQTE', midDivX + 2, yPos);
    yPos += 4;
    doc.text('(   ) Post Grad', midDivX + 2, yPos);
    yPos += 4;
    doc.text('(   ) StuFAPs', midDivX + 2, yPos);

    // Draw footer section vertical dividers
    doc.line(midDivX, footerTop, midDivX, yPos + 3);
    doc.line(rightDivX, footerTop, rightDivX, yPos + 3);

    // Draw all vertical dividers for other sections
    // Section 1: Name/Position divider (aligned to rightDivX)
    doc.line(rightDivX, section1Top, rightDivX, section2Top);
    
    // Section 2: Office/Destination/Period dividers
    doc.line(officeDestinationDivX, section2Top, officeDestinationDivX, section3Top);
    doc.line(rightDivX, section2Top, rightDivX, section3Top);
    
    // Section 4: 4-left-column dividers, plus rightDivX separator for "Please check" column
    for (let i = 1; i < 4; i++) {
        doc.line(margin + (leftFourColWidth * i), tableTop, margin + (leftFourColWidth * i), tableBottom);
    }
    doc.line(rightDivX, tableTop, rightDivX, tableBottom);

    // Draw border around the form (ending after StuFAPs)
    const borderHeight = yPos - borderTop + 3;
    doc.setLineWidth(0.5);
    doc.rect(margin, borderTop, contentWidth, borderHeight);

    // Save the PDF
    const fileName = `TA_${taNumber.replace(/-/g, '_')}_${Date.now()}.pdf`;
    doc.save(fileName);
};

// Export for use in other files
window.generateTAPDF = generateTAPDF;
