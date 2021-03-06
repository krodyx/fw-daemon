const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Pango = imports.gi.Pango;
const Signals = imports.signals;
const St = imports.gi.St;

const ModalDialog = imports.ui.modalDialog;
const Tweener = imports.ui.tweener;

const RuleScope = {
    APPLY_ONCE: 0,
    APPLY_SESSION: 1,
    APPLY_FOREVER: 2,
};

const DetailSection = new Lang.Class({
    Name: 'DetailSection',

    _init: function() {
        this.actor = new St.BoxLayout({ style_class: 'fw-details-section' });
        this._left = new St.BoxLayout({ vertical: true,  style_class: 'fw-details-left'});
        this._right = new St.BoxLayout({ vertical: true });
        this.actor.add_child(this._left);
        this.actor.add_child(this._right);

        this.ipAddr = this._addDetails("IP Address:");
        this.path = this._addDetails("Path:");
        this.pid = this._addDetails("Process ID:");
        this.user = this._addDetails("User:");
    },

    _addDetails: function(text) {
        let title = new St.Label({ style_class: 'fw-detail-title', text: text});
        let msg = new St.Label({ style_class: 'fw-detail-message' });
        this._left.add(title, { expand: true, x_fill: false, x_align: St.Align.END});
        this._right.add(msg);
        return msg;
    },

    setDetails: function(ip, path, pid, user) {
        this.ipAddr.text = ip;
        this.path.text = path;
        this.pid.text = pid.toString();
        this.user.text = user;
    }
});

const OptionListItem = new Lang.Class({
    Name: 'OptionListItem',

    _init: function(text, idx) {
        this.actor = new St.BoxLayout({ style_class: 'fw-option-item', reactive: true, can_focus: true });
        this._selectedIcon = new St.Icon({style_class: 'fw-option-item-icon', icon_name: 'object-select-symbolic'});
        this._selectedIcon.opacity = 0;

        this._label = new St.Label({text: text});
        let spacer = new St.Bin();
        this.actor.add_child(this._label);
        this.actor.add(spacer, {expand: true});
        this.actor.add_child(this._selectedIcon);
        this.idx = idx;

        let action = new Clutter.ClickAction();
        action.connect('clicked', Lang.bind(this, function() {
            this.actor.grab_key_focus();
            this.emit('selected');
        }));
        this.actor.add_action(action);

        this.actor.connect('key-press-event', Lang.bind(this, this._onKeyPressEvent));
    },

    setText: function(text) {
        if (text) {
            this._label.text = text;
            this._label.show();
            this.actor.show();
        } else {
            this._label.text = "";
            this._label.hide();
            this.actor.hide();
        }
    },

    setSelected: function(isSelected) {
        this._selectedIcon.opacity = isSelected ? 255 : 0;
    },

    _onKeyPressEvent: function(actor, event) {
        let symbol = event.get_key_symbol();
        if (symbol == Clutter.KEY_space || symbol == Clutter.KEY_Return) {
            this.emit('selected');
        }
    }
});
Signals.addSignalMethods(OptionListItem.prototype);

const OptionList = new Lang.Class({
    Name: 'OptionList',

    _init: function() {
        this.actor = new St.BoxLayout({vertical: true, style_class: 'fw-option-list'});
        this.buttonGroup = new ButtonGroup("Forever", "Session", "Once");
        this.actor.add_child(this.buttonGroup.actor);
        this.items = [];
        this._selected;
    },

    setOptionText: function(idx, text) {
        if(this.items.length <= idx) {
            log("attempt to setOptionText with idx = "+ idx + " when this.items.length = "+ this.items.length)
            return;
        }
        this.items[idx].setText(text);
    },

    addOptions: function(options) {
        for(let i = 0; i < options.length; i++) {
            this._addOption(options[i], i)
        }
        if(this.items.length) {
            this._optionSelected(this.items[0])
        }
    },

    _addOption: function(text, idx) {
        let item = new OptionListItem(text, idx);
        item.connect('selected', Lang.bind(this, function() {
            this._optionSelected(item);
        }));
        this.actor.add_child(item.actor);
        this.items.push(item);
    },

    _optionSelected: function(item) {
        if (item == this._selected) {
            return;
        }
        if(this._selected) {
            this._selected.actor.remove_style_pseudo_class('selected');
            this._selected.setSelected(false);
        }
        item.setSelected(true);
        this._selected = item;
        this._selected.actor.add_style_pseudo_class('selected');
    },

    selectedIdx: function() {
        return this._selected.idx;
    },

    selectedScope: function() {
        switch(this.buttonGroup._checked) {
        case 0:
            return RuleScope.APPLY_FOREVER;
        case 1:
            return RuleScope.APPLY_SESSION;
        case 2:
            return RuleScope.APPLY_ONCE;
        default:
            log("unexpected scope value "+ this.buttonGroup._selected);
            return RuleScope.APPLY_SESSION;
        }
    },

    scopeToIdx: function(scope) {
        switch (scope) {
        case RuleScope.APPLY_ONCE:
            return 2;
        case RuleScope.APPLY_SESSION:
            return 1;
        case RuleScope.APPLY_FOREVER:
            return 0;
        default:
            log("unexpected scope value "+ scope);
            return 1;
        }
    }

});

const ButtonGroup = new Lang.Class({
    Name: 'ButtonGroup',

    _init: function() {
        this.actor = new St.BoxLayout({ style_class: 'fw-button-group'});
        this._checked = -1;
        this._buttons= [];
        for(let i = 0; i < arguments.length; i++) {
            let idx = i;
            this._buttons[i] = new St.Button({ style_class: 'fw-group-button button',
                                               label: arguments[i],
                                               can_focus: true,
                                               x_expand: true });
            this._buttons[i].connect('clicked', Lang.bind(this, function(actor) {
                this._setChecked(idx);
            }));
            this.actor.add_child(this._buttons[i]);
        }
        this._setChecked(0);
    },

    _setChecked: function(idx) {

        if(idx == this._checked) {
            return;
        }
        this._buttons[idx].add_style_pseudo_class('checked');
        if(this._checked >= 0) {
            this._buttons[this._checked].remove_style_pseudo_class('checked');
        }
        this._checked = idx;
    },

});

const ExpandingSection = new Lang.Class({
    Name: 'ExpandingSection',

    _init: function(text, content) {
        this.actor = new St.BoxLayout({vertical: true});
        this._createHeader(this.actor, text);
        this.scroll = new St.ScrollView({hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.NEVER });
        this.actor.add_child(this.scroll);
        this.isOpen = false;
    },

    _createHeader: function(parent, text) {
        this.header = new St.BoxLayout({ style_class: 'fw-expanding-section-header', reactive: true, track_hover: true, can_focus: true});
        this.label = new St.Label({ style_class: 'fw-expanding-section-label', text: text, y_expand: true, y_align: Clutter.ActorAlign.CENTER });
        this.header.add_child(this.label);
        let spacer = new St.Bin({ style_class: 'fw-expanding-section-spacer'});
        this.header.add(spacer, {expand: true});

        this._triangle = new St.Icon({ style_class: 'popup-menu-arrow',
            icon_name: 'pan-end-symbolic',
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER});
        this._triangle.pivot_point = new Clutter.Point({ x: 0.5, y: 0.6 });

        this._triangleBin = new St.Widget({ y_expand: true, y_align: Clutter.ActorAlign.CENTER});
        this._triangleBin.add_child(this._triangle);

        this.header.add_child(this._triangleBin);
        this.header.connect('button-press-event', Lang.bind(this, this._onButtonPressEvent));
        this.header.connect('button-release-event', Lang.bind(this, this._onButtonReleaseEvent));
        this.header.connect('key-press-event', Lang.bind(this, this._onKeyPressEvent));
        parent.add_child(this.header);
    },

    _onButtonPressEvent: function (actor, event) {
        this.actor.add_style_pseudo_class('active');
        return Clutter.EVENT_PROPAGATE;
    },

    _onButtonReleaseEvent: function (actor, event) {
        this.actor.remove_style_pseudo_class('active');
        this.activate(event);
        return Clutter.EVENT_STOP;
    },

    _onKeyPressEvent: function(actor, event) {
        let symbol = event.get_key_symbol();
        if (symbol == Clutter.KEY_space || symbol == Clutter.KEY_Return) {
            this.activate(event);
        }
    },

    activate: function(event) {
        if(!this.isOpen) {
            this.open();
        } else {
            this.close();
        }
    },

    set_child: function(child) {
        if(this.child) {
            this.child.destroy();
        }
        this.scroll.add_actor(child);
        this.child = child;
        let [min, nat] = this.child.get_preferred_width(-1);
        this.scroll.width = nat;
        this.scroll.show();
        this.scroll.height = 0;
        this.child.hide();
    },

    open: function() {
        if(this.isOpen) {
            return;
        }
        if(!this.child) {
            return;
        }
        this.isOpen = true;
        this.scroll.show();
        this.child.show();
        let targetAngle = 90;
        let [minHeight, naturalHeight] = this.child.get_preferred_height(-1);
        this.scroll.height = 0;
        this.scroll._arrowRotation = this._triangle.rotation_angle_z;
        Tweener.addTween(this.scroll,
            { _arrowRotation: targetAngle,
                height: naturalHeight,
                time: 0.5,
                onUpdateScope: this,
                onUpdate: function() {
                    this._triangle.rotation_angle_z = this.scroll._arrowRotation;
                },
                onCompleteScope: this,
                onComplete: function() {
                    this.scroll.set_height(-1);
                }
            });
    },

    close: function() {
        if(!this.isOpen) {
            return;
        }
        this.isOpen = false;
        this.scroll._arrowRotation = this._triangle.rotation_angle_z;
        Tweener.addTween(this.scroll,
            { _arrowRotation: 0,
                height: 0,
                time: 0.5,
                onUpdateScope: this,
                onUpdate: function() {
                    this._triangle.rotation_angle_z = this.scroll._arrowRotation;
                },
                onCompleteScope: this,
                onComplete: function() {
                    this.child.hide();
                }
            });
    }

});

const PromptDialogHeader = new Lang.Class({
    Name: 'PromptDialogHeader',

    _init: function() {
        this.actor = new St.BoxLayout();
        let inner = new St.BoxLayout({ vertical: true });
        this.icon = new St.Icon({style_class: 'fw-prompt-icon'})
        this.title = new St.Label({style_class: 'fw-prompt-title'})
        this.message = new St.Label({style_class: 'fw-prompt-message'});
        this.message.clutter_text.line_wrap = true;
        this.message.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        inner.add_child(this.title);
        inner.add_child(this.message);
        this.actor.add_child(this.icon);
        this.actor.add_child(inner);
    },

    setTitle: function(text) {
        if(!text) {
            text = "Unknown";
        }
        this.title.text = text;
    },

    setMessage: function(text) {
        this.message.text = text;
    },

    setIcon: function(name) {
        this.icon.icon_name = name;
    },

    setIconDefault: function() {
        this.setIcon('security-high-symbolic');
    },

});

const PromptDialog = new Lang.Class({
    Name: 'PromptDialog',
    Extends: ModalDialog.ModalDialog,

    _init: function(invocation) {
        this.parent({ styleClass: 'fw-prompt-dialog' });
        this._invocation = invocation;
        this.header = new PromptDialogHeader();
        this.contentLayout.add_child(this.header.actor);

        this.details = new ExpandingSection("Details");
        this.contentLayout.add(this.details.actor, {y_fill: false, x_fill: true});
        let box = new St.BoxLayout({ vertical: true });
        this.details.set_child(box);
        this.info = new DetailSection();
        box.add_child(this.info.actor);

        this.optionList = new OptionList();
        box.add_child(this.optionList.actor);
        this.optionList.addOptions([
            "Only PORT AND ADDRESS",
            "Only ADDRESS",
            "Only PORT",
            "Any Connection"]);

        this._initialKeyFocusDestroyId = 1;
        this.setButtons([
            { label: "Allow", action: Lang.bind(this, this.onAllow) },
            { label: "Deny", action: Lang.bind(this, this.onDeny) }
        ]);
    },

    onAllow: function() {
        this.close();
        this.sendReturnValue(true);
    },

    onDeny: function() {
        this.close();
        this.sendReturnValue(false);
    },

    sendReturnValue: function(allow) {
        if(!this._invocation) {
            return;
        }
        let verb = "DENY";
        if(allow) {
            verb = "ALLOW";
        }
        let rule = verb + "|" + this.ruleTarget();
        let scope = this.optionList.selectedScope()
        this._invocation.return_value(GLib.Variant.new('(is)', [scope, rule]));
        this._invocation = null;
    },

    ruleTarget: function() {
        switch(this.optionList.selectedIdx()) {
        case 0:
            return this._address + ":" + this._port;
        case 1:
            return this._address + ":*";
        case 2:
            return "*:" + this._port;
        case 3:
            return "*:*";
        }
    },

    update: function(application, icon, path, address, port, ip, user, pid, proto, expanded, expert, action) {
        this._address = address;
        this._port = port;

        let port_str = (proto+"").toUpperCase() + " Port "+ port;

        this.header.setTitle(application);
        this.header.setMessage("Wants to connect to "+ address + " on " + port_str);

        if (expanded) {
            this.details.isOpen = false;
            this.details.activate()
        }
        if(icon) {
            this.header.setIcon(icon);
        } else {
            this.header.setIconDefault();
        }

        this.optionList.setOptionText(0, "Only "+ address + " on "+ port_str);
        if (expert) {
            this.optionList.setOptionText(1, "Only "+ address + " on any port");
            this.optionList.setOptionText(2, "Only "+ port_str);
        } else {
            this.optionList.setOptionText(1, false);
            this.optionList.setOptionText(2, false);
        }

        this.optionList.buttonGroup._setChecked(this.optionList.scopeToIdx(action))
        this.info.setDetails(ip, path, pid, user);
    },
});
