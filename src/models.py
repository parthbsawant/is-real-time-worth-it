"""Step 4: the sequence model. One shared encoder (LSTM or Transformer) with two heads:
next-purchase category (14-way) and CLV (log1p of 90-day spend)."""
import torch
import torch.nn as nn

from .config import N_CAT, WINDOW


class SeqModel(nn.Module):
    def __init__(self, arch: str = "lstm", emb: int = 64, use_age: bool = False):
        super().__init__()
        assert arch in ("lstm", "transformer")
        self.arch = arch
        self.use_age = use_age          # follow-up experiment: elapsed time since the newest purchase
        self.cat_emb = nn.Embedding(N_CAT + 1, emb, padding_idx=0)       # 0 = padding
        self.num_proj = nn.Linear(2, emb)                                # recency gap + amount
        self.in_proj = nn.Linear(2 * emb, emb)
        if arch == "lstm":
            self.enc = nn.LSTM(emb, 128, num_layers=2, batch_first=True, dropout=0.2)
            hid = 128
        else:
            self.pos = nn.Embedding(WINDOW, emb)
            layer = nn.TransformerEncoderLayer(d_model=emb, nhead=4, dim_feedforward=128,
                                               dropout=0.1, batch_first=True)
            self.enc = nn.TransformerEncoder(layer, num_layers=2, enable_nested_tensor=False)
            hid = emb
        self.drop = nn.Dropout(0.2 if arch == "lstm" else 0.1)
        self.cat_head = nn.Linear(hid + int(use_age), N_CAT)
        self.clv_head = nn.Linear(hid + int(use_age), 1)

    def forward(self, cat, gap, amt, mask, age=None):
        x = torch.cat([self.cat_emb(cat), self.num_proj(torch.stack([gap, amt], -1))], -1)
        x = self.in_proj(x) * mask.unsqueeze(-1)                         # padded steps -> zeros
        if self.arch == "lstm":
            out, _ = self.enc(x)
        else:
            x = x + self.pos(torch.arange(x.size(1), device=x.device))[None]
            out = self.enc(x, src_key_padding_mask=(mask == 0))
        h = self.drop(out[:, -1])                    # left-padded, so the last step is the latest purchase
        if self.use_age:
            h = torch.cat([h, age.unsqueeze(-1)], -1)
        return self.cat_head(h), self.clv_head(h).squeeze(-1)


def n_params(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters() if p.requires_grad)
