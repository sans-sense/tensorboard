/* Copyright 2016 The TensorFlow Authors. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/
namespace vz_projector {
  /** Limit the number of search results we show to the user. */
  const LIMIT_RESULTS = 100;
  const DEFAULT_NEIGHBORS = 100;

  // tslint:disable-next-line
  export let InspectorPanelPolymer = PolymerElement({
    is: 'vz-projector-inspector-panel',
    properties: {
      selectedMetadataField: String,
      metadataFields: Array,
      metadataColumn: String,
      numNN: {type: Number, value: DEFAULT_NEIGHBORS},
      updateNumNN: Object,
      spriteMeta: Object, // type: `SpriteMetadata`
      showNeighborImages: {
        type: Boolean,
        value: true,
        observer: '_refreshNeighborsList',
      },
      spriteImagesAvailable: {
        type: Boolean,
        value: true,
        observer: '_refreshNeighborsList',
      },
    },
  });

  type SpriteMetadata = {
    imagePath?: string;
    singleImageDim?: number[];
    aspectRatio?: number;
    nCols?: number;
  };

  export class InspectorPanel extends InspectorPanelPolymer {
    distFunc: DistanceFunction;
    numNN: number;

    private projectorEventContext: ProjectorEventContext;

    private selectedMetadataField: string;
    private metadataFields: string[];
    private metadataColumn: string;
    private spriteMeta: SpriteMetadata;
    private displayContexts: string[];
    private projector: Projector;
    private selectedPointIndices: number[];
    private neighborsOfFirstPoint: knn.NearestEntry[];
    private showNeighborImages: boolean;
    private spriteImagesAvailable: boolean;
    private searchBox: ProjectorInput;

    private resetFilterButton: HTMLButtonElement;
    private setFilterButton: HTMLButtonElement;
    private clearSelectionButton: HTMLButtonElement;
    private limitMessage: HTMLDivElement;
    private selectedElements: string[];
    private relationType: HTMLSelectElement;
    private saveButton: HTMLButtonElement;
    private searchVal: string;

    ready() {
      super.ready();
      this.resetFilterButton = this.$$('.reset-filter') as HTMLButtonElement;
      this.setFilterButton = this.$$('.set-filter') as HTMLButtonElement;
      this.clearSelectionButton = this.$$(
        '.clear-selection'
      ) as HTMLButtonElement;
      this.limitMessage = this.$$('.limit-msg') as HTMLDivElement;
      this.searchBox = this.$$('#search-box') as ProjectorInput;
      this.relationType = this.$$('#relation') as HTMLSelectElement;
      this.saveButton = this.$$('.save-button') as HTMLButtonElement;
      this.selectedElements = [];
      this.displayContexts = [];
      this.searchVal = '';
    }

    initialize(
      projector: Projector,
      projectorEventContext: ProjectorEventContext
    ) {
      this.projector = projector;
      this.projectorEventContext = projectorEventContext;
      this.setupUI(projector);
      projectorEventContext.registerSelectionChangedListener(
        (selection, neighbors) => this.updateInspectorPane(selection, neighbors)
      );
    }

    /** Updates the nearest neighbors list in the inspector. */
    private updateInspectorPane(
      indices: number[],
      neighbors: knn.NearestEntry[]
    ) {
      this.neighborsOfFirstPoint = neighbors;
      this.selectedPointIndices = indices;

      this.updateFilterButtons(indices.length + neighbors.length);
      this.updateNeighborsList(neighbors);
      if (neighbors.length === 0) {
        this.updateSearchResults(indices);
      } else {
        this.updateSearchResults([]);
      }
    }

    private enableResetFilterButton(enabled: boolean) {
      this.resetFilterButton.disabled = !enabled;
    }

    restoreUIFromBookmark(bookmark: State) {
      this.enableResetFilterButton(bookmark.filteredPoints != null);
    }

    metadataChanged(spriteAndMetadata: SpriteAndMetadataInfo) {
      let labelIndex = -1;
      this.metadataFields = spriteAndMetadata.stats.map((stats, i) => {
        if (!stats.isNumeric && labelIndex === -1) {
          labelIndex = i;
        }
        return stats.name;
      });

      if (
        spriteAndMetadata.spriteMetadata &&
        spriteAndMetadata.spriteMetadata.imagePath
      ) {
        const [
          spriteWidth,
          spriteHeight,
        ] = spriteAndMetadata.spriteMetadata.singleImageDim;

        this.spriteMeta = {
          imagePath: spriteAndMetadata.spriteImage.src,
          aspectRatio: spriteWidth / spriteHeight,
          nCols: Math.floor(spriteAndMetadata.spriteImage.width / spriteWidth),
          singleImageDim: [spriteWidth, spriteHeight],
        };
      } else {
        this.spriteMeta = {};
      }
      this.spriteImagesAvailable = !!this.spriteMeta.imagePath;

      if (
        this.selectedMetadataField == null ||
        this.metadataFields.filter(
          (name) => name === this.selectedMetadataField
        ).length === 0
      ) {
        // Make the default label the first non-numeric column.
        this.selectedMetadataField = this.metadataFields[
          Math.max(0, labelIndex)
        ];
      }
      this.updateInspectorPane(
        this.selectedPointIndices,
        this.neighborsOfFirstPoint
      );
    }

    datasetChanged() {
      this.enableResetFilterButton(false);
    }

    _refreshNeighborsList() {
      this.updateNeighborsList();
    }

    metadataEditorContext(enabled: boolean, metadataColumn: string) {
      if (!this.projector || !this.projector.dataSet) {
        return;
      }

      let stat = this.projector.dataSet.spriteAndMetadataInfo.stats.filter(
        (s) => s.name === metadataColumn
      );
      if (!enabled || stat.length === 0 || stat[0].tooManyUniqueValues) {
        this.removeContext('.metadata-info');
        return;
      }

      this.metadataColumn = metadataColumn;
      this.addContext('.metadata-info');
      let list = this.$$('.metadata-list') as HTMLDivElement;
      list.innerHTML = '';

      let entries = stat[0].uniqueEntries.sort((a, b) => a.count - b.count);
      let maxCount = entries[entries.length - 1].count;

      entries.forEach((e) => {
        const metadataElement = document.createElement('div');
        metadataElement.className = 'metadata';

        const metadataElementLink = document.createElement('a');
        metadataElementLink.className = 'metadata-link';
        metadataElementLink.title = e.label;

        const labelValueElement = document.createElement('div');
        labelValueElement.className = 'label-and-value';

        const labelElement = document.createElement('div');
        labelElement.className = 'label';
        labelElement.style.color = dist2color(this.distFunc, maxCount, e.count);
        labelElement.innerText = e.label;

        const valueElement = document.createElement('div');
        valueElement.className = 'value';
        valueElement.innerText = e.count.toString();

        labelValueElement.appendChild(labelElement);
        labelValueElement.appendChild(valueElement);

        const barElement = document.createElement('div');
        barElement.className = 'bar';

        const barFillElement = document.createElement('div');
        barFillElement.className = 'fill';
        barFillElement.style.borderTopColor = dist2color(
          this.distFunc,
          maxCount,
          e.count
        );
        barFillElement.style.width =
          normalizeDist(this.distFunc, maxCount, e.count) * 100 + '%';
        barElement.appendChild(barFillElement);

        for (let j = 1; j < 4; j++) {
          const tickElement = document.createElement('div');
          tickElement.className = 'tick';
          tickElement.style.left = (j * 100) / 4 + '%';
          barElement.appendChild(tickElement);
        }

        metadataElementLink.appendChild(labelValueElement);
        metadataElementLink.appendChild(barElement);
        metadataElement.appendChild(metadataElementLink);
        list.appendChild(metadataElement);

        metadataElementLink.onclick = () => {
          this.projector.metadataEdit(metadataColumn, e.label);
        };
      });
    }

    private addContext(context: string) {
      if (this.displayContexts.indexOf(context) === -1) {
        this.displayContexts.push(context);
      }
      this.displayContexts.forEach((c) => {
        (this.$$(c) as HTMLDivElement).style.display = 'none';
      });
      (this.$$(context) as HTMLDivElement).style.display = null;
    }

    private removeContext(context: string) {
      this.displayContexts = this.displayContexts.filter((c) => c !== context);
      (this.$$(context) as HTMLDivElement).style.display = 'none';

      if (this.displayContexts.length > 0) {
        let lastContext = this.displayContexts[this.displayContexts.length - 1];
        (this.$$(lastContext) as HTMLDivElement).style.display = null;
      }
    }

    private updateSearchResults(indices: number[]) {
      const container = this.$$('.matches-list') as HTMLDivElement;
      const list = container.querySelector('.list') as HTMLDivElement;
      list.innerHTML = '';
      if (indices.length === 0) {
        this.removeContext('.matches-list');
        return;
      }
      this.addContext('.matches-list');

      this.limitMessage.style.display =
        indices.length <= LIMIT_RESULTS ? 'none' : null;
      indices = indices.slice(0, LIMIT_RESULTS);

      for (let i = 0; i < indices.length; i++) {
        const index = indices[i];

        const row = document.createElement('div');
        row.className = 'row';

        const label = this.getLabelFromIndex(index);
        const rowLink = document.createElement('a');
        rowLink.className = 'label';
        rowLink.title = label;
        rowLink.innerText = label;

        rowLink.onmouseenter = () => {
          this.projectorEventContext.notifyHoverOverPoint(index);
        };
        rowLink.onmouseleave = () => {
          this.projectorEventContext.notifyHoverOverPoint(null);
        };
        rowLink.onclick = () => {
          this.searchVal = label;
          this.projectorEventContext.notifySelectionChanged([index]);
        };

        row.appendChild(rowLink);
        list.appendChild(row);
      }
    }

    private getLabelFromIndex(pointIndex: number): string {
      const metadata = this.projector.dataSet.points[pointIndex].metadata[
        this.selectedMetadataField
      ];
      return metadata !== undefined
        ? String(metadata)
        : `Unknown #${pointIndex}`;
    }

    private spriteImageRenderer() {
      const spriteImagePath = this.spriteMeta.imagePath;
      const {aspectRatio, nCols} = this.spriteMeta;
      const paddingBottom = 100 / aspectRatio + '%';
      const backgroundSize = `${nCols * 100}% ${nCols * 100}%`;
      const backgroundImage = `url(${CSS.escape(spriteImagePath)})`;

      return (neighbor: knn.NearestEntry): HTMLElement => {
        const spriteElementImage = document.createElement('div');
        spriteElementImage.className = 'sprite-image';
        spriteElementImage.style.backgroundImage = backgroundImage;
        spriteElementImage.style.paddingBottom = paddingBottom;
        spriteElementImage.style.backgroundSize = backgroundSize;
        const [row, col] = [
          Math.floor(neighbor.index / nCols),
          neighbor.index % nCols,
        ];
        const [top, left] = [
          (row / (nCols - 1)) * 100,
          (col / (nCols - 1)) * 100,
        ];
        spriteElementImage.style.backgroundPosition = `${left}% ${top}%`;

        return spriteElementImage;
      };
    }

    private updateNeighborsList(neighbors?: knn.NearestEntry[]) {
      neighbors = neighbors || this._currentNeighbors;
      this._currentNeighbors = neighbors;
      if (neighbors == null) {
        return;
      }

      const nnlist = this.$$('.nn-list') as HTMLDivElement;
      nnlist.innerHTML = '';

      if (neighbors.length === 0) {
        this.removeContext('.nn');
        return;
      }
      this.addContext('.nn');

      this.searchBox.message = '';
      const minDist = neighbors.length > 0 ? neighbors[0].dist : 0;

      if (this.spriteImagesAvailable && this.showNeighborImages) {
        var imageRenderer = this.spriteImageRenderer();
      }

      for (let i = 0; i < neighbors.length; i++) {
        const neighbor = neighbors[i];

        const neighborElement = document.createElement('div');
        neighborElement.className = 'neighbor';

        const neighborElementLink = document.createElement('a');
        neighborElementLink.className = 'neighbor-link';
        neighborElementLink.title = this.getLabelFromIndex(neighbor.index);

        const labelValueElement = document.createElement('div');
        labelValueElement.className = 'label-and-value';

        const labelElement = document.createElement('div');
        labelElement.className = 'label';
        labelElement.style.color = dist2color(
          this.distFunc,
          neighbor.dist,
          minDist
        );

        labelElement.innerText = this.getLabelFromIndex(neighbor.index);
        const valueElement = document.createElement('div');
        valueElement.className = 'value';
        valueElement.innerText = neighbor.dist.toFixed(3);

        // create checkbox element
        const checkboxElement = document.createElement('input');
        checkboxElement.setAttribute('type', 'checkbox');
        checkboxElement.setAttribute('value', labelElement.innerText);

        // create div to bind checkbox and value
        const divElement = document.createElement('div');
        divElement.className = 'inline-label';
        divElement.appendChild(checkboxElement);
        divElement.appendChild(labelElement);

        labelValueElement.appendChild(divElement);
        labelValueElement.appendChild(valueElement);

        const barElement = document.createElement('div');
        barElement.className = 'bar';

        const barFillElement = document.createElement('div');
        barFillElement.className = 'fill';
        barFillElement.style.borderTopColor = dist2color(
          this.distFunc,
          neighbor.dist,
          minDist
        );
        barFillElement.style.width =
          normalizeDist(this.distFunc, neighbor.dist, minDist) * 100 + '%';
        barElement.appendChild(barFillElement);

        for (let j = 1; j < 4; j++) {
          const tickElement = document.createElement('div');
          tickElement.className = 'tick';
          tickElement.style.left = (j * 100) / 4 + '%';
          barElement.appendChild(tickElement);
        }

        if (this.spriteImagesAvailable && this.showNeighborImages) {
          const neighborElementImage = imageRenderer(neighbor);
          neighborElement.appendChild(neighborElementImage);
        }

        neighborElementLink.appendChild(labelValueElement);
        neighborElementLink.appendChild(barElement);
        neighborElement.appendChild(neighborElementLink);
        nnlist.appendChild(neighborElement);

        neighborElementLink.onmouseenter = () => {
          this.projectorEventContext.notifyHoverOverPoint(neighbor.index);
        };
        neighborElementLink.onmouseleave = () => {
          this.projectorEventContext.notifyHoverOverPoint(null);
        };
        neighborElementLink.onclick = () => {
          this.projectorEventContext.notifySelectionChanged([neighbor.index]);
        };
        checkboxElement.onclick = (e) => {
          e.stopPropagation();
          this.selectedElements.push(labelElement.innerText);
        };
      }
    }

    private updateFilterButtons(numPoints: number) {
      if (numPoints > 1) {
        this.setFilterButton.innerText = `Isolate ${numPoints} points`;
        this.setFilterButton.disabled = null;
        this.clearSelectionButton.disabled = null;
      } else {
        this.setFilterButton.disabled = true;
        this.clearSelectionButton.disabled = true;
      }
    }

    private setupUI(projector: Projector) {
      this.distFunc = vector.cosDist;
      const eucDist = this.$$('.distance a.euclidean') as HTMLLinkElement;
      eucDist.onclick = () => {
        const links = this.root.querySelectorAll('.distance a');
        for (let i = 0; i < links.length; i++) {
          util.classed(links[i] as HTMLElement, 'selected', false);
        }
        util.classed(eucDist as HTMLElement, 'selected', true);

        this.distFunc = vector.dist;
        this.projectorEventContext.notifyDistanceMetricChanged(this.distFunc);
        const neighbors = projector.dataSet.findNeighbors(
          this.selectedPointIndices[0],
          this.distFunc,
          this.numNN
        );
        this.updateNeighborsList(neighbors);
      };

      const cosDist = this.$$('.distance a.cosine') as HTMLLinkElement;
      cosDist.onclick = () => {
        const links = this.root.querySelectorAll('.distance a');
        for (let i = 0; i < links.length; i++) {
          util.classed(links[i] as HTMLElement, 'selected', false);
        }
        util.classed(cosDist, 'selected', true);

        this.distFunc = vector.cosDist;
        this.projectorEventContext.notifyDistanceMetricChanged(this.distFunc);
        const neighbors = projector.dataSet.findNeighbors(
          this.selectedPointIndices[0],
          this.distFunc,
          this.numNN
        );
        this.updateNeighborsList(neighbors);
      };

      // Called whenever the search text input changes.
      const updateInput = (value: string, inRegexMode: boolean) => {
        if (value == null || value.trim() === '') {
          this.searchBox.message = '';
          this.projectorEventContext.notifySelectionChanged([]);
          return;
        }
        const indices = projector.dataSet.query(
          value,
          inRegexMode,
          this.selectedMetadataField
        );
        if (indices.length === 0) {
          this.searchBox.message = '0 matches.';
        } else {
          this.searchBox.message = `${indices.length} matches.`;
        }
        this.projectorEventContext.notifySelectionChanged(indices);
      };
      this.searchBox.registerInputChangedListener((value, inRegexMode) => {
        updateInput(value, inRegexMode);
      });

      // Filtering dataset.
      this.setFilterButton.onclick = () => {
        const indices = this.selectedPointIndices.concat(
          this.neighborsOfFirstPoint.map((n) => n.index)
        );
        projector.filterDataset(indices);
        this.enableResetFilterButton(true);
        this.updateFilterButtons(0);
      };

      this.resetFilterButton.onclick = () => {
        projector.resetFilterDataset();
        this.enableResetFilterButton(false);
      };

      this.clearSelectionButton.onclick = () => {
        projector.adjustSelectionAndHover([]);
      };

      this.saveButton.onclick = () => {
        const exportObj = {
          name: [this.searchVal],
          label: [this.searchVal],
          relType: [this.relationType.value],
          elements: this.selectedElements,
        };
        var dataStr =
          'data:text/json;charset=utf-8,' +
          encodeURIComponent(JSON.stringify(exportObj, null, 2));
        var downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute('href', dataStr);
        downloadAnchorNode.setAttribute('download', this.searchVal + '.json');
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
      };
      this.enableResetFilterButton(false);
    }

    private updateNumNN() {
      if (this.selectedPointIndices != null) {
        this.projectorEventContext.notifySelectionChanged([
          this.selectedPointIndices[0],
        ]);
      }
    }
  }

  customElements.define(InspectorPanel.prototype.is, InspectorPanel);
} // namespace vz_projector
