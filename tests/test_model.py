import pytest

torch = pytest.importorskip("torch")
from src.config import N_CAT, WINDOW
from src.models import SeqModel


def batch(n=8, real=5):
    cat = torch.zeros(n, WINDOW, dtype=torch.long)
    cat[:, -real:] = torch.randint(1, N_CAT + 1, (n, real))
    mask = (cat > 0).float()
    return cat, torch.rand(n, WINDOW) * mask, torch.randn(n, WINDOW) * mask, mask


@pytest.mark.parametrize("arch", ["lstm", "transformer"])
def test_output_shapes(arch):
    logits, clv = SeqModel(arch)(*batch())
    assert logits.shape == (8, N_CAT) and clv.shape == (8,)


@pytest.mark.parametrize("arch", ["lstm", "transformer"])
def test_padding_does_not_change_output(arch):
    m = SeqModel(arch).eval()
    cat, gap, amt, mask = batch()
    a = m(cat, gap, amt, mask)
    gap2, amt2 = gap.clone(), amt.clone()
    gap2[:, :10] += 3.0; amt2[:, :10] += 3.0                      # change padded positions only
    b = m(cat, gap2, amt2, mask)
    assert torch.allclose(a[0], b[0], atol=1e-5) and torch.allclose(a[1], b[1], atol=1e-5)


@pytest.mark.parametrize("arch", ["lstm", "transformer"])
def test_one_training_step(arch):
    m = SeqModel(arch)
    opt = torch.optim.Adam(m.parameters(), 1e-3)
    cat, gap, amt, mask = batch()
    logits, clv = m(cat, gap, amt, mask)
    loss = torch.nn.functional.cross_entropy(logits, torch.randint(0, N_CAT, (8,))) + clv.pow(2).mean()
    loss.backward(); opt.step()
    assert torch.isfinite(loss)
