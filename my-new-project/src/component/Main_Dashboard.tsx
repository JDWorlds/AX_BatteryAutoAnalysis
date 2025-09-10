import * as go from 'gojs';
import React from 'react';
import { useEffect, useRef } from 'react';

function KanbanBoard() {
  const diagramRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!diagramRef.current) return;

    const $ = go.GraphObject.make;

    class PoolLayout extends go.GridLayout {
      MINLENGTH = 200;
      MINBREADTH = 100;

      constructor() {
        super();
        this.cellSize = new go.Size(1, 1);
        this.wrappingColumn = Infinity;
        this.spacing = new go.Size(0, 0);
        this.alignment = go.GridAlignment.Position;
      }

      doLayout(coll: go.Diagram | go.Group) {
        const diagram = this.diagram;
        if (!diagram) return;
        diagram.startTransaction('PoolLayout');
        const minlen = this.computeMinPoolLength();
        diagram.findTopLevelGroups().each((lane) => {
          if (!(lane instanceof go.Group)) return;
          const shape = lane.selectionObject;
          if (shape !== null) {
            const sz = this.computeLaneSize(lane);
            shape.width = !isNaN(shape.width) ? Math.max(shape.width, sz.width) : sz.width;
            shape.height = minlen;
            const cell = lane.resizeCellSize;
            if (!isNaN(shape.width) && !isNaN(cell.width) && cell.width > 0)
              shape.width = Math.ceil(shape.width / cell.width) * cell.width;
            if (!isNaN(shape.height) && !isNaN(cell.height) && cell.height > 0)
              shape.height = Math.ceil(shape.height / cell.height) * cell.height;
          }
        });
        super.doLayout(coll);
        diagram.commitTransaction('PoolLayout');
      }

      computeMinPoolLength() {
        let len = this.MINLENGTH;
        this.diagram?.findTopLevelGroups().each((lane) => {
          const holder = (lane as go.Group).placeholder;
          if (holder) {
            const sz = holder.actualBounds;
            len = Math.max(len, sz.height);
          }
        });
        return len;
      }

      computeLaneSize(lane: go.Group) {
        const sz = new go.Size(lane.isSubGraphExpanded ? this.MINBREADTH : 1, this.MINLENGTH);
        if (lane.isSubGraphExpanded) {
          const holder = lane.placeholder;
          if (holder) {
            const hsz = holder.actualBounds;
            sz.width = Math.max(sz.width, hsz.width);
          }
        }
        const hdr = lane.findObject('HEADER');
        if (hdr) sz.width = Math.max(sz.width, hdr.actualBounds.width);
        return sz;
      }
    }

    const myDiagram = $(go.Diagram, diagramRef.current, {
      contentAlignment: go.Spot.TopLeft,
      layout: new PoolLayout(),
      mouseDrop: (e) => e.diagram.currentTool.doCancel(),
      'commandHandler.copiesGroupKey': true,
      'undoManager.isEnabled': true,
      SelectionMoved: () => myDiagram.layoutDiagram(true),
      SelectionCopied: () => myDiagram.layoutDiagram(true),
      'textEditingTool.starting': go.TextEditingStarting.SingleClick
    });

    const noteColors = ['#009CCC', '#CC293D', '#FFD700'];
    function getNoteColor(num: number) {
      return noteColors[Math.min(num, noteColors.length - 1)];
    }

    myDiagram.nodeTemplate = $(
      go.Node,
      'Horizontal',
      { locationSpot: go.Spot.TopLeft },
      new go.Binding('location', 'loc', go.Point.parse).makeTwoWay(go.Point.stringify),
      $(
        go.Shape,
        'Rectangle',
        {
          fill: '#009CCC',
          strokeWidth: 1,
          stroke: '#009CCC',
          width: 100,
          height: 100,
          stretch: go.GraphObject.Vertical,
          alignment: go.Spot.Left,
          click: (e, obj) => {
            const part = obj.part;
            if (part) {
              myDiagram.startTransaction('Update node color');
              let newColor = parseInt(part.data.color) + 1;
              if (newColor > noteColors.length - 1) newColor = 0;
              myDiagram.model.setDataProperty(part.data, 'color', newColor);
              myDiagram.commitTransaction('Update node color');
            }
          }
        },
        new go.Binding('fill', 'color', getNoteColor),
        new go.Binding('stroke', 'color', getNoteColor)
      ),
      $(
        go.Panel,
        'Auto',
        $(go.Shape, 'Rectangle', { fill: 'white', stroke: '#CCCCCC' }),
        $(
          go.TextBlock,
          {
            margin: 6,
            font: '20px auto',
            editable: true,
            stroke: '#000',
            maxSize: new go.Size(130, NaN),
            alignment: go.Spot.TopLeft
          },
          new go.Binding('text').makeTwoWay()
        )
      )
    );

    myDiagram.groupTemplate = $(
      go.Group,
      'Vertical',
      {
        selectable: false,
        layerName: 'Background',
        layout: $(go.GridLayout, {
          wrappingColumn: 1,
          spacing: new go.Size(10, 10),
          alignment: go.GridAlignment.Position
        }),
        computesBoundsIncludingLocation: true,
        computesBoundsAfterDrag: true,
        handlesDragDropForMembers: true,
        mouseDrop: (e, grp) => {
          const group = grp as go.Group;
          if (e.diagram.selection.all((n) => !(n instanceof go.Group))) {
            if (group.diagram) {
              const ok = group.addMembers(group.diagram.selection, true);
              if (!ok) group.diagram.currentTool.doCancel();
            }
          }
        }
      },
      new go.Binding('location', 'loc', go.Point.parse).makeTwoWay(go.Point.stringify),
      new go.Binding('isSubGraphExpanded', 'expanded').makeTwoWay(),
      $(
        go.Panel,
        'Horizontal',
        { name: 'HEADER' },
        $('SubGraphExpanderButton', { margin: 5 }),
        $(
          go.TextBlock,
          {
            font: '15px Lato, sans-serif',
            editable: true,
            margin: new go.Margin(10, 0, 0, 0)
          },
          new go.Binding('text').makeTwoWay()
        )
      ),
      $(
        go.Panel,
        'Auto',
        $(
          go.Shape,
          'Rectangle',
          {
            name: 'SHAPE',
            fill: '#F1F1F1',
            stroke: null,
            strokeWidth: 4
          },
          new go.Binding('fill', 'isHighlighted', (h) => (h ? '#D6D6D6' : '#F1F1F1'))
        ),
        $(go.Placeholder, { padding: 12, alignment: go.Spot.TopLeft })
      )
    );

    myDiagram.model = go.Model.fromJson({
      "class": "go.GraphLinksModel",
      "nodeDataArray": [
        { "key": "Problems", "text": "Problems", "isGroup": true, "loc": "0 23.52284749830794" },
        { "key": "Reproduced", "text": "Reproduced", "isGroup": true, "color": "0", "loc": "109 23.52284749830794" },
        { "key": "Identified", "text": "Identified", "isGroup": true, "color": "0", "loc": "235 23.52284749830794" },
        { "key": "Fixing", "text": "Fixing", "isGroup": true, "color": "0", "loc": "343 23.52284749830794" },
        { "key": "Reviewing", "text": "Reviewing", "isGroup": true, "color": "0", "loc": "451 23.52284749830794" },
        { "key": "Testing", "text": "Testing", "isGroup": true, "color": "0", "loc": "562 23.52284749830794" },
        { "key": "Customer", "text": "Customer", "isGroup": true, "color": "0", "loc": "671 23.52284749830794" },
        { "key": 1, "text": "text for oneA", "group": "Problems", "color": "0", "loc": "12 35.52284749830794" },
        { "key": 2, "text": "text for oneB", "group": "Problems", "color": "1", "loc": "12 65.52284749830794" },
        { "key": 3, "text": "text for oneC", "group": "Problems", "color": "0", "loc": "12 95.52284749830794" },
        { "key": 4, "text": "text for oneD", "group": "Problems", "color": "1", "loc": "12 125.52284749830794" },
        { "key": 5, "text": "text for twoA", "group": "Reproduced", "color": "1", "loc": "121 35.52284749830794" },
        { "key": 6, "text": "text for twoB", "group": "Reproduced", "color": "1", "loc": "121 65.52284749830794" },
        { "key": 7, "text": "text for twoC", "group": "Identified", "color": "0", "loc": "247 35.52284749830794" },
        { "key": 8, "text": "text for twoD", "group": "Fixing", "color": "0", "loc": "355 35.52284749830794" },
        { "key": 9, "text": "text for twoE", "group": "Reviewing", "color": "0", "loc": "463 35.52284749830794" },
        { "key": 10, "text": "text for twoF", "group": "Reviewing", "color": "1", "loc": "463 65.52284749830794" },
        { "key": 11, "text": "text for twoG", "group": "Testing", "color": "0", "loc": "574 35.52284749830794" },
        { "key": 12, "text": "text for fourA", "group": "Customer", "color": "1", "loc": "683 35.52284749830794" },
        { "key": 13, "text": "text for fourB", "group": "Customer", "color": "1", "loc": "683 65.52284749830794" },
        { "key": 14, "text": "text for fourC", "group": "Customer", "color": "1", "loc": "683 95.52284749830794" },
        { "key": 15, "text": "text for fourD", "group": "Customer", "color": "0", "loc": "683 125.52284749830794" },
        { "key": 16, "text": "text for fiveA", "group": "Customer", "color": "0", "loc": "683 155.52284749830795" }
      ],
      "linkDataArray": []
    });

    return () => {
      myDiagram.div = null;
    };
  }, []);

  return <div ref={diagramRef} style={{ width: '100%', height: '1200px', border: '1px solid black' }} />;
}

export default KanbanBoard;
