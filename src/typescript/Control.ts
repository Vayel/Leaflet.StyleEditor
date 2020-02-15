import L, { Control } from 'leaflet'
import Util from './Util'
import LeafletOptions from './interfaces/LeafletOptions'
import { DefaultMarker } from './marker/DefaultMarker'
import { StyleEditor } from './StyleEditor'
import StyleForm from './StyleForm'

export class StyleEditorControl extends Control {
  private util = Util.getInstance()

  styleEditor = new StyleEditor()

  options: LeafletOptions

  constructor(options: LeafletOptions = defaultOptions) {
    super()
    this.options = options
  }

  private controlDiv: HTMLElement
  private controlUI: HTMLElement
  private cancelUI: HTMLElement
  private styleEditorDiv: HTMLElement
  private styleEditorHeader: HTMLElement
  private styleEditorInterior: HTMLElement
  private tooltip
  private tooltipWrapper
  private layerGroups
  private editLayers

  private styleForm: StyleForm

  onAdd(map: L.Map) {
    this.styleEditor.map = map
    return this.createUi()
  }

  fireEvent(eventName: string, element?: any) {
    this.util.fireEvent(eventName, element)
  }

  createUi(): HTMLElement {
    this.controlDiv = L.DomUtil.create('div', 'leaflet-control-styleeditor leaflet-control leaflet-bar')
    this.controlUI = L.DomUtil.create('a', 'leaflet-control-styleeditor-interior', this.controlDiv)
    this.controlUI.title = 'Style Editor'

    this.cancelUI = L.DomUtil.create('div', 'leaflet-control-styleeditor-cancel leaflet-styleeditor-hidden', this.controlDiv)
    this.cancelUI.innerHTML = this.styleEditor.options.strings.cancel
    this.cancelUI.title = this.styleEditor.options.strings.cancelTitle

    this.styleEditorDiv = L.DomUtil.create('div', 'leaflet-styleeditor', this.styleEditor.map.getContainer as any)
    this.styleEditorHeader = L.DomUtil.create('div', 'leaflet-styleeditor-header', this.styleEditorDiv)
    this.styleEditorInterior = L.DomUtil.create('div', 'leaflet-styleeditor-interior', this.styleEditorDiv)

    this.addDomEvents()
    this.addEventListeners()
    this.addButtons()

    this.styleForm = new StyleForm({
      styleEditorDiv: this.styleEditorDiv,
      styleEditorInterior: this.styleEditorInterior,
    })

    return this.controlDiv
  }

  addDomEvents() {
    L.DomEvent.disableScrollPropagation(this.styleEditorDiv)
    L.DomEvent.disableScrollPropagation(this.controlDiv)
    L.DomEvent.disableScrollPropagation(this.cancelUI)

    L.DomEvent.disableClickPropagation(this.styleEditorDiv)
    L.DomEvent.disableClickPropagation(this.controlDiv)
    L.DomEvent.disableClickPropagation(this.cancelUI)

    L.DomEvent.on(this.controlDiv, 'click', function () {
      this.toggle()
    }, this)
  }

  addEventListeners() {
    this.addLeafletDrawEvents()
    this.addLeafletEditableEvents()
  }

  addLeafletDrawEvents() {
    if (!this.options.openOnLeafletDraw || !L.Control.Draw) {
      return
    }
    this.styleEditor.map.on('layeradd', this.onLayerAdd, this)
    this.styleEditor.map.on(L.Draw.Event.CREATED, this.onLayerCreated, this)
  }

  addLeafletEditableEvents() {
    if (!this.options.openOnLeafletEditable || !L.Editable) {
      return
    }
    this.styleEditor.map.on('layeradd', this.onLayerAdd, this)
    this.styleEditor.map.on('editable:created', this.onLayerCreated, this)
  }

  onLayerCreated(layer) {
    this.removeIndicators()
    this.styleEditor.currentElement = layer.layer
  }

  onLayerAdd(e) {
    if (this.styleEditor.currentElement) {
      if (e.layer === this.util.getCurrentElement()) {
        this.enable(e.layer)
      }
    }
  }

  onRemove() {
    // hide everything that may be visible
    // remove edit events for layers
    // remove tooltip
    this.disable()

    // remove events
    this.removeDomEvents()
    this.removeEventListeners()

    // remove dom elements
    L.DomUtil.remove(this.styleEditorDiv)
    L.DomUtil.remove(this.cancelUI)

    // delete dom elements
    delete this.styleEditorDiv
    delete this.cancelUI
  }

  removeEventListeners() {
    this.styleEditor.map.off('layeradd', this.onLayerAdd)
    if (L.Draw) {
      this.styleEditor.map.off(L.Draw.Event.CREATED, this.onLayerCreated)
    }
    if (L.Editable) {
      this.styleEditor.map.off('editable:created', this.onLayerCreated)
    }
  }

  removeDomEvents() {
    L.DomEvent.off(this.controlDiv, 'click', function () {
      this.toggle()
    }, this)
  }

  addButtons() {
    let nextBtn = L.DomUtil.create('button',
      'leaflet-styleeditor-button styleeditor-nextBtn', this.styleEditorHeader)
    nextBtn.title = this.options.strings.tooltipNext

    L.DomEvent.on(nextBtn, 'click', function (e) {
      this.hideEditor()

      if (L.DomUtil.hasClass(this.controlUI, 'enabled')) {
        this.createTooltip()
      }

      e.stopPropagation()
    }, this)
  }

  toggle() {
    if (L.DomUtil.hasClass(this.controlUI, 'enabled')) {
      this.disable()
    } else {
      this.enable()
    }
  }

  enable(layer?) {
    if (this._layerIsIgnored(layer)) {
      return
    }

    L.DomUtil.addClass(this.controlUI, 'enabled')
    this.styleEditor.map.eachLayer(this.addEditClickEvents, this)
    this.showCancelButton()
    this.createTooltip()

    if (layer !== undefined) {
      if (this.isEnabled()) {
        this.removeIndicators()
      }
      this.initChangeStyle({ target: layer })
    }
  }

  isEnabled() {
    return L.DomUtil.hasClass(this.controlUI, 'enabled')
  }

  disable() {
    if (this.isEnabled()) {
      this.editLayers.forEach(this.removeEditClickEvents, this)
      this.editLayers = []
      this.layerGroups = []
      this.hideEditor()
      this.hideCancelButton()
      this.removeTooltip()
      L.DomUtil.removeClass(this.controlUI, 'enabled')
    }
  }

  addEditClickEvents(layer) {
    if (this._layerIsIgnored(layer)) {
      return
    }
    if (this.options.useGrouping && layer instanceof L.LayerGroup) {
      this.layerGroups.push(layer)
    } else if (layer instanceof L.Marker || layer instanceof L.Path) {
      let evt = layer.on('click', this.initChangeStyle, this)
      this.editLayers.push(evt)
    }
  }

  removeEditClickEvents(layer) {
    layer.off('click', this.initChangeStyle, this)
  }

  addIndicators() {
    if (!this.styleEditor.currentElement) {
      return
    }

    let currentElement = this.styleEditor.currentElement.target
    if (currentElement instanceof L.LayerGroup) {
      currentElement.eachLayer(function (layer) {
        if (layer instanceof L.Marker && layer.getElement()) {
          L.DomUtil.addClass(layer.getElement(), 'leaflet-styleeditor-marker-selected')
        }
      })
    } else if (currentElement instanceof L.Marker) {
      if (currentElement.getElement()) {
        L.DomUtil.addClass(currentElement.getElement(), 'leaflet-styleeditor-marker-selected')
      }
    }
  }

  removeIndicators() {
    if (!this.styleEditor.currentElement) {
      return
    }

    let currentElement = this.util.getCurrentElement()
    if (currentElement instanceof L.LayerGroup) {
      currentElement.eachLayer(function (layer) {
        //TODO
        const anything = layer as any
        if (anything.getElement()) {
          L.DomUtil.removeClass(anything.getElement(), 'leaflet-styleeditor-marker-selected')
        }
      })
    } else {
      if (currentElement.getElement()) {
        L.DomUtil.removeClass(currentElement.getElement(), 'leaflet-styleeditor-marker-selected')
      }
    }
  }

  hideEditor() {
    if (L.DomUtil.hasClass(this.styleEditorDiv, 'editor-enabled')) {
      this.removeIndicators()
      L.DomUtil.removeClass(this.styleEditorDiv, 'editor-enabled')
      this.fireEvent('hidden')
    }
  }

  hideCancelButton() {
    L.DomUtil.addClass(this.cancelUI, 'leaflet-styleeditor-hidden')
  }

  showEditor() {
    let editorDiv = this.styleEditorDiv
    if (!L.DomUtil.hasClass(editorDiv, 'editor-enabled')) {
      L.DomUtil.addClass(editorDiv, 'editor-enabled')
      this.fireEvent('visible')
    }
  }

  showCancelButton() {
    L.DomUtil.removeClass(this.cancelUI, 'leaflet-styleeditor-hidden')
  }

  initChangeStyle(e) {
    this.removeIndicators()
    this.styleEditor.currentElement = (this.options.useGrouping) ? this.getMatchingElement(e) : e

    this.addIndicators()
    this.showEditor()
    this.removeTooltip()

    let layer = e
    if (!(layer instanceof L.Layer)) {
      layer = e.target
    }

    this.fireEvent('editing', layer)
    if (layer instanceof L.Marker) {
      // ensure iconOptions are set for Leaflet.Draw created Markers
      this.options.markerType.resetIconOptions(layer)
      // marker
      this.showMarkerForm(layer)
    } else {
      // layer with of type L.GeoJSON or L.Path (polyline, polygon, ...)
      this.showGeometryForm(layer)
    }
  }

  showGeometryForm(layer) {
    this.fireEvent('geometry', layer)
    this.styleForm.showGeometryForm()
  }

  showMarkerForm(layer) {
    this.fireEvent('marker', layer)
    this.styleForm.showMarkerForm()
  }

  createTooltip() {
    if (!this.options.showTooltip) {
      return
    }

    if (!this.tooltipWrapper) {
      this.tooltipWrapper =
        L.DomUtil.create('div', 'leaflet-styleeditor-tooltip-wrapper', this.styleEditor.map.getContainer())
    }

    if (!this.tooltip) {
      this.tooltip = L.DomUtil.create('div', 'leaflet-styleeditor-tooltip', this.tooltipWrapper)
    }
    this.tooltip.innerHTML = this.options.strings.tooltip
  }

  getMatchingElement(e) {
    let group = null
    let layer = e.target

    for (let i = 0; i < this.layerGroups.length; ++i) {
      group = this.layerGroups[i]
      if (group && layer !== group && group.hasLayer(layer)) {
        // we use the opacity style to check for correct object
        if (!group.options || !group.options.opacity) {
          group.options = layer.options

          // special handling for layers... we pass the setIcon function
          if (layer.setIcon) {
            group.setIcon = function (icon) {
              group.eachLayer(function (layer) {
                if (layer instanceof L.Marker) {
                  layer.setIcon(icon)
                }
              })
            }
          }
        }

        return this.getMatchingElement({
          target: group
        })
      }
    }
    return e
  }

  removeTooltip() {
    if (this.tooltip && this.tooltip.parentNode) {
      this.tooltip.remove()
      this.tooltip = undefined
    }
  }

  _layerIsIgnored(layer) {
    if (layer === undefined) {
      return false
    }
    return this.options.ignoreLayerTypes.some(
      layerType => layer.styleEditor && layer.styleEditor.type.toUpperCase() === layerType.toUpperCase()
    )
  }
}

const defaultOptions: LeafletOptions = {
    position: 'topleft',

    colorRamp: ['#1abc9c', '#2ecc71', '#3498db', '#9b59b6', '#34495e', '#16a085', '#27ae60', '#2980b9', '#8e44ad',
      '#2c3e50', '#f1c40f', '#e67e22', '#e74c3c', '#ecf0f1', '#95a5a6', '#f39c12', '#d35400', '#c0392b',
      '#bdc3c7', '#7f8c8d'],
    defaultColor: null,

    markers: null,
    defaultMarkerIcon: null,
    defaultMarkerColor: null,

    ignoreLayerTypes: [],

    openOnLeafletDraw: true,
    openOnLeafletEditable: true,

    showTooltip: true,

    strings: {
      cancel: 'Cancel',
      cancelTitle: 'Cancel Styling',
      tooltip: 'Click on the element you want to style',
      tooltipNext: 'Choose another element you want to style'
    },
    useGrouping: true,

    forms: {},
    styleEditorEventPrefix: 'styleeditor:',

    markerType: new DefaultMarker()
  }
