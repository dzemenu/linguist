import React, { Component } from 'react';
import { Link } from 'react-router';
import _ from 'lodash';
import classnames from 'classnames';
import { localeParse, localeSerializer, KEY_DELIMITER, findNode, findNodeParent, updateNodeKeys } from '../utils/serializer';
const { ipcRenderer } = require('electron');

export default class Home extends Component {
  constructor(props) {
    super(props);
    this.state = {
      locales: {},
      masterFormat: [],
      masterStructure: {},
      hiddenKeys: {},
      editingId: null
    };
  }

  componentDidMount() {
    // var home = document.getElementById('home');
    // home.ondragover = function () {
    //   return false;
    // };
    // home.ondragleave = home.ondragend = function () {
    //   return false;
    // };
    // home.ondrop = function (e) {
    //   e.preventDefault();
    //   var file = e.dataTransfer.files[0];
    //   console.log('File you dragged here is', file.path);
    //   return false;
    // };
  }

  processFile(obj, parentKey = '', masterFormat = []) {
    let keys = Object.keys(obj);
    let self = this;
    keys.forEach((key) => {
      const currentKey = (parentKey === '' ? key : `${parentKey}${KEY_DELIMITER}${key}`);

      if (typeof obj[key] === 'object') {
        if (masterFormat.indexOf(currentKey) < 0) {
          masterFormat.push(currentKey);
        }
        masterFormat = self.processFile(obj[key], currentKey, masterFormat);
      } else if (typeof obj[key] === 'string' && masterFormat.indexOf(currentKey) < 0) {
        masterFormat.push(currentKey);
      }
    });

    return masterFormat;
  }

  getRowMode(key) {
    let keyHidden = 'SHOW';
    if (this.state.hiddenKeys.hasOwnProperty(key)) {
      return 'COLLAPSED';
    }
    _.each(Object.keys(this.state.hiddenKeys), ((hiddenKey) => {
      if (key.indexOf(hiddenKey) > -1) {
        keyHidden = 'HIDDEN';
        return false;
      }
    }));
    return keyHidden;
  }

  formatTableKeyCol(key, data) {
    const isBeingEdited = this.state.editingId === data.id;
    return (
      <span>
        {isBeingEdited ?
          <input ref="editingKey"
            type="text"
            className="form-control"
            defaultValue={key}/>
          :
          <span>
            {_.map(_.range(data.meta.level - 1), (i) => {
              return <span key={i}>&nbsp;&nbsp;</span>
            })}
            <i className={classnames('ln-caret fa fa-fw fa-lg', {
              'fa-caret-down': !data.meta.collapse,
              'fa-caret-right': data.meta.collapse,
              'invisible': data.meta.type === 'LEAF'
              })}
              onClick={this.toggleCollapseNode.bind(this, data.id)}/>
            <strong>{key}</strong>
            {data.meta.type === 'NODE' ? ` {${_.keys(data.value).length}}` : null}
          </span>
        }
      </span>
    );
  }

  toggleCollapseNode(id) {
    const masterStructure = this.state.masterStructure;
    const node = findNode(id, masterStructure);
    node.meta.collapse = !node.meta.collapse;
    this.setState({
      masterStructure
    });
  }

  editNode(id, action) {
    this.setState({
      editingId: action === 'EDIT' ? id : null
    });
  }

  removeNode(id) {
    const masterStructure = this.state.masterStructure;
    const parentNode = findNodeParent(id, masterStructure);
    const idFragments = id.split(KEY_DELIMITER);
    delete parentNode[_.last(idFragments)];

    this.setState({
      masterStructure,
      editingId: null
    }, this.saveToFile);
  }

  updateNode(id) {
    const locales = this.state.locales;

    const masterStructure = this.state.masterStructure;
    const parentNode = findNodeParent(id, masterStructure);
    const idFragments = id.split(KEY_DELIMITER);
    const nodeName = _.last(idFragments);

    if (parentNode[nodeName].meta.type === 'LEAF') {
      {_.keys(this.state.locales).map((locale) => {
        const localeObject = locales[locale];
        (parentNode[nodeName].value)[localeObject.name] = this.refs[locale].value;
      })};
    }

    const keyName = this.refs.editingKey.value;
    if (nodeName !== keyName) {
      // Key has changed
      parentNode[keyName] = parentNode[nodeName];
      // TODO: propogate changes in name to id
      delete parentNode[nodeName];
      parentNode[keyName] = updateNodeKeys(parentNode[keyName], keyName);
    }

    this.setState({
      masterStructure: masterStructure,
      editingId: null
    }, this.saveToFile);
  }

  saveToFile() {
    const locales = this.state.locales;
    {_.keys(locales).map((locale) => {
      const localeObject = locales[locale];
      const serializedData = localeSerializer(this.state.masterStructure, localeObject.name);
      console.log(serializedData);
      ipcRenderer.send('save', localeObject.path, serializedData);
    })};
  }

  renderTableBodyRows() {
    const tableBodyRows = [];

    const renderRow = (nodeValue, collapse) => {
      _.each(_.keys(nodeValue).sort(), (key) => {
        const data = nodeValue[key];
        const isBeingEdited = this.state.editingId === data.id;
        const tableRow = (
          <tr key={data.id} className={collapse ? 'hidden' : ''}>
            <td>
              {isBeingEdited ?
                <div className="ls-edit-btns">
                  <button className="btn btn-xs btn-success ln-row-save"
                    onClick={this.updateNode.bind(this, data.id)}>
                    <i className="fa fa-fw fa-lg fa-check"/>
                  </button>
                  <button className="btn btn-xs btn-danger ln-row-cancel"
                    onClick={this.editNode.bind(this, data.id, 'CANCEL')}>
                    <i className="fa fa-fw fa-lg fa-times"/>
                  </button>
                </div>
                :
                <div className="ls-edit-btns">
                  <button className="btn btn-xs btn-warning ln-row-edit">
                    <i className="fa fa-fw fa-lg fa-pencil" onClick={this.editNode.bind(this, data.id, 'EDIT')}/>
                  </button>
                  <button className="btn btn-xs btn-danger ln-row-edit">
                    <i className="fa fa-fw fa-lg fa-trash" onClick={this.removeNode.bind(this, data.id, 'DELETE')}/>
                  </button>
                </div>
              }
            </td>
            <td>
              {this.formatTableKeyCol(key, data)}
            </td>
            {data.meta.type === 'NODE' ?
              <td colSpan={_.keys(this.state.locales).length}/> :
              _.keys(this.state.locales).map((locale) => {
                const name = this.state.locales[locale].name;
                return (
                  <td key={name}>
                    {isBeingEdited && !data.meta.collapse ?
                      <input ref={locale}
                        type="text"
                        className="form-control"
                        defaultValue={data.value[name]}/>
                      :
                      data.value[name]
                    }
                  </td>
                );
              })
            }
          </tr>
        );
        tableBodyRows.push(tableRow);

        if (data.meta.type === 'NODE') {
          renderRow(data.value, data.meta.collapse || collapse);
        }
      });
    }

    renderRow(this.state.masterStructure, false);

    return (
      <tbody>{tableBodyRows}</tbody>
    );
  }

  renderRow(key, rowMode) {
    const anyLocale = Object.keys(this.state.locales)[0];
    const value = this.getValueForKey(this.state.locales[anyLocale].data, key);
    const shouldShowCaret = !value;
    const isBeingEdited = this.state.editingKey === key;

    return (
      <tr className={classnames({ 'ln-is-editing': this.state.editingKey === key })}>
        <td>{this.formatKey(key, rowMode, shouldShowCaret)}</td>
        <td>
          {isBeingEdited ?
            <div className="ls-edit-btns">
              <button className="btn btn-xs btn-success ln-row-save"
                onClick={this.saveRow.bind(this, key, 'SAVE')}>
                <i className="fa fa-fw fa-lg fa-check"/>
              </button>
              <button className="btn btn-xs btn-danger ln-row-cancel"
                onClick={this.cancelEditRow.bind(this)}>
                <i className="fa fa-fw fa-lg fa-times"/>
              </button>
            </div>
            :
            <div className="ls-edit-btns">
              <button className="btn btn-xs btn-warning ln-row-edit">
                <i className="fa fa-fw fa-lg fa-pencil" onClick={this.editRow.bind(this, key)}/>
              </button>
              <button className="btn btn-xs btn-danger ln-row-edit">
                <i className="fa fa-fw fa-lg fa-trash" onClick={this.saveRow.bind(this, key, 'DELETE')}/>
              </button>
            </div>
          }
        </td>
        {_.keys(this.state.locales).map((locale) => {
          const localeObject = this.state.locales[locale];
          const value = rowMode === 'SHOW' ? this.getValueForKey(localeObject.data, key) : null;
          return (
            <td key={localeObject.name}>
              {this.state.editingKey === key && !shouldShowCaret ?
                <input ref={locale} type="text" className="form-control" defaultValue={value}/> : <span>{value}</span>
              }
            </td>
          );
        })}
      </tr>
    );
  }

  formatKey(key, rowMode, shouldShowCaret) {
    let levelKeys = key.split(KEY_DELIMITER);
    let str = '';
    const keyValue = levelKeys[levelKeys.length - 1];
    const isBeingEdited = this.state.editingKey === key;
    return (
      <span>
        {isBeingEdited ? null : _.map(_.range(levelKeys.length - 1), (i) => {
          return <span key={i}>&nbsp;&nbsp;&nbsp;&nbsp;</span>
        })}
        {shouldShowCaret && !isBeingEdited ?
          <i className={classnames('ln-caret fa fa-fw fa-lg', {
            'fa-caret-down': rowMode === 'SHOW',
            'fa-caret-right': rowMode === 'COLLAPSED'
            })}
            onClick={this.toggleKey.bind(this, key)}/> : null
        }
        {isBeingEdited ?
          <input ref="editingKey" type="text" className="form-control" defaultValue={keyValue}/> : <span> &nbsp;{keyValue}</span>
        }
      </span>
    );
  }

  toggleKey(key) {
    const hiddenKeys = this.state.hiddenKeys;
    if (hiddenKeys.hasOwnProperty(key)) {
      delete hiddenKeys[key];
    } else {
      hiddenKeys[key] = true;
    }
    this.setState({
      hiddenKeys: hiddenKeys
    });
  }

  saveRow(key, type) {
    const locales = this.state.locales;
    const newKey = type === 'SAVE' ? this.refs.editingKey.value : null;
    let data = null;
    {Object.keys(this.state.locales).map((locale) => {
      const localeObject = locales[locale];

      let levelKeys = key.split(KEY_DELIMITER);
      let obj = localeObject.data;
      for (let i = 0; i < levelKeys.length - 1; i++) {
        obj = obj[levelKeys[i]];
      }
      const originalValue = obj[levelKeys[levelKeys.length - 1]];
      delete obj[levelKeys[levelKeys.length - 1]];
      if (type === 'SAVE') {
        obj[newKey] = this.refs[locale] ? this.refs[locale].value : originalValue;
      }
      ipcRenderer.send('save', localeObject.path, localeObject.data);
      data = localeObject.data;
    })};

    const anyKey = Object.keys(this.state.locales)[0];
    const masterFormat = this.processFile(data);
    masterFormat.sort();

    this.setState({
      masterFormat: masterFormat,
      locales: locales,
      editingKey: null
    });
  }

  cancelEditRow() {
    this.setState({
      editingKey: null
    });
  }

  getValueForKey(localeFileData, key) {
    let levelKeys = key.split(KEY_DELIMITER);
    let value = localeFileData;
    levelKeys.forEach((levelKey) => {
      try {
        value = value[levelKey];
      } catch (e) {
        return null;
      }
    });
    return typeof value !== 'object' ? value : null;
  }

  fileChangeHandler(event) {
    const files = event.target.files;
    const locales = this.state.locales;
    const self = this;

    Object.keys(files).forEach((key) => {
      const path = files[key].path;
      const name = files[key].name;
      let localeObject = {
        name,
        path
      };

      if (true || files[key].type === 'application/json') {
        locales[path] = localeObject;
      } else {
        alert("File must be of JSON format!");
      }

      const reader = new FileReader();
      reader.onloadend = (e) => {
        const fileData = JSON.parse(e.target.result);

        const parsedData = localeParse(fileData, name);
        const combinedMasterStructure = _.merge(self.state.masterStructure, parsedData);

        self.setState({
          masterStructure: combinedMasterStructure
        });
      }

      reader.readAsText(files[key]);
    });

    this.setState({
      locales: locales
    });
  }

  render() {
    return (
      <div id="home">
        <div className="container">
          <input type="file" multiple onChange={this.fileChangeHandler.bind(this)}/>
        </div>
        <table className="table table-hover">
          <thead>
            <tr>
              <th>Action</th>
              <th>Key</th>
              {_.keys(this.state.locales).map((locale) => {
                const name = this.state.locales[locale].name;
                return (
                  <th key={name}>{name}</th>
                );
              })}
            </tr>
          </thead>
          {this.renderTableBodyRows()}
        </table>
      </div>
    );
  }
}
