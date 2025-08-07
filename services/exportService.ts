import jsPDF from 'jspdf';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { GuideContent } from '../types';

const generateAndDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

export const generatePdf = (title: string, content: GuideContent): void => {
    const doc = new jsPDF();
    const margin = 15;
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = 20;

    const addText = (text: string, size: number, style: 'bold' | 'normal', x: number, maxWidth: number) => {
        doc.setFontSize(size);
        doc.setFont('helvetica', style);
        const splitText = doc.splitTextToSize(text, maxWidth);
        
        splitText.forEach((line: string) => {
            if (y > pageHeight - margin) {
                doc.addPage();
                y = margin;
            }
            doc.text(line, x, y);
            y += (size * 0.5); // line height
        });
    };

    addText(title, 18, 'bold', margin, 180);
    y += 10;
    
    addText(content.description, 11, 'normal', margin, 180);

    if (content.subPoints && content.subPoints.length > 0) {
        y += 15;
        if (y > pageHeight - margin) { doc.addPage(); y = margin; }
        addText("Da non perdere all'interno:", 14, 'bold', margin, 180);
        y += 8;

        content.subPoints.forEach(poi => {
            if (y > pageHeight - 40) { // check for space for heading + some text
                doc.addPage();
                y = margin;
            }
            addText(poi.name, 12, 'bold', margin, 180);
            y += 5;
            addText(poi.description, 10, 'normal', margin, 180);
            y += 10;
        });
    }
    
    doc.save(`${title.replace(/\s/g, '_')}.pdf`);
};

export const generateDocx = async (title: string, content: GuideContent): Promise<void> => {
    const mainParagraphs = content.description.split('\n').filter(p => p.trim() !== '').map(p => 
        new Paragraph({ children: [new TextRun(p)], spacing: { after: 200 } })
    );

    let subPointParagraphs: Paragraph[] = [];
    if (content.subPoints && content.subPoints.length > 0) {
        subPointParagraphs.push(new Paragraph({
            children: [new TextRun({ text: "Da non perdere all'interno:", bold: true, size: 28 })], // 14pt
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 }
        }));
        
        content.subPoints.forEach(poi => {
            subPointParagraphs.push(new Paragraph({
                children: [new TextRun({ text: poi.name, bold: true, size: 24 })], // 12pt
                heading: HeadingLevel.HEADING_3,
                spacing: { before: 300, after: 150 }
            }));
            poi.description.split('\n').filter(p => p.trim() !== '').forEach(p => {
                subPointParagraphs.push(new Paragraph({
                    children: [new TextRun(p)],
                    spacing: { after: 200 }
                }));
            });
        });
    }

    const doc = new Document({
        sections: [{
            properties: {},
            children: [
                new Paragraph({
                    children: [new TextRun({ text: title, bold: true, size: 36 })], // 18pt
                    heading: HeadingLevel.TITLE,
                    spacing: { after: 400 }
                }),
                ...mainParagraphs,
                ...subPointParagraphs
            ],
        }],
    });

    const blob = await Packer.toBlob(doc);
    generateAndDownload(blob, `${title.replace(/\s/g, '_')}.docx`);
};